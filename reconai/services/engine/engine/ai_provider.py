"""AI provider abstraction layer for ReconAI.

Supports Gemini (primary) and Groq/Qwen (fallback) with automatic retry
and fallback logic.  All responses are JSON-parseable dicts.
"""
from __future__ import annotations

import json
import logging
import os
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Abstract provider interface
# ---------------------------------------------------------------------------


class AiProvider(ABC):
    """Abstract base for LLM providers."""

    @abstractmethod
    async def complete(
        self, prompt: str, system: str = "", response_format: str = "json"
    ) -> Dict[str, Any]:
        """Send a prompt and return a structured JSON response."""
        ...

    @abstractmethod
    def name(self) -> str:
        """Human-readable provider name."""
        ...

    @abstractmethod
    def model(self) -> str:
        """Model identifier."""
        ...


# ---------------------------------------------------------------------------
# Gemini provider
# ---------------------------------------------------------------------------


class GeminiProvider(AiProvider):
    """Google Gemini via the Generative Language API."""

    _ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models"

    def __init__(self, api_key: str, model: str = "gemini-2.0-flash") -> None:
        if not api_key:
            raise ValueError("Gemini API key must not be empty")
        self._api_key = api_key
        self._model = model

    def name(self) -> str:
        return "gemini"

    def model(self) -> str:
        return self._model

    async def complete(
        self, prompt: str, system: str = "", response_format: str = "json"
    ) -> Dict[str, Any]:
        url = f"{self._ENDPOINT}/{self._model}:generateContent?key={self._api_key}"

        contents: List[Dict[str, Any]] = []
        if system:
            contents.append({"role": "user", "parts": [{"text": f"[System] {system}"}]})
        contents.append({"role": "user", "parts": [{"text": prompt}]})

        payload: Dict[str, Any] = {
            "contents": contents,
            "generationConfig": {
                "temperature": 0.2,
                "topP": 0.8,
                "topK": 40,
                "maxOutputTokens": 8192,
            },
        }

        if response_format == "json":
            payload["generationConfig"]["responseMimeType"] = "application/json"

        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()

        candidates = data.get("candidates") or []
        if not candidates:
            raise RuntimeError("Gemini returned no candidates")

        parts = candidates[0].get("content", {}).get("parts", [])
        text = "".join(p.get("text", "") for p in parts).strip()

        if not text:
            raise RuntimeError("Gemini returned empty text")

        if response_format == "json":
            return _parse_json(text)
        return {"text": text}


# ---------------------------------------------------------------------------
# Groq provider (OpenAI-compatible endpoint)
# ---------------------------------------------------------------------------


class GroqProvider(AiProvider):
    """Groq / OpenAI-compatible provider (Qwen, LLaMA, etc.)."""

    _ENDPOINT = "https://api.groq.com/openai/v1/chat/completions"

    def __init__(self, api_key: str, model: str = "qwen-2.5-32b") -> None:
        if not api_key:
            raise ValueError("Groq API key must not be empty")
        self._api_key = api_key
        self._model = model

    def name(self) -> str:
        return "groq"

    def model(self) -> str:
        return self._model

    async def complete(
        self, prompt: str, system: str = "", response_format: str = "json"
    ) -> Dict[str, Any]:
        messages: List[Dict[str, str]] = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        body: Dict[str, Any] = {
            "model": self._model,
            "messages": messages,
            "temperature": 0.2,
            "max_tokens": 8192,
        }

        if response_format == "json":
            body["response_format"] = {"type": "json_object"}

        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(self._ENDPOINT, json=body, headers=headers)
            resp.raise_for_status()
            data = resp.json()

        choices = data.get("choices") or []
        if not choices:
            raise RuntimeError("Groq returned no choices")

        text = choices[0].get("message", {}).get("content", "").strip()
        if not text:
            raise RuntimeError("Groq returned empty text")

        if response_format == "json":
            return _parse_json(text)
        return {"text": text}


# ---------------------------------------------------------------------------
# Fallback manager
# ---------------------------------------------------------------------------


class AiManager:
    """Wraps a primary provider with optional fallback.

    Automatically retries with the fallback provider if the primary fails.
    """

    def __init__(
        self,
        primary: AiProvider,
        fallback: Optional[AiProvider] = None,
    ) -> None:
        self._primary = primary
        self._fallback = fallback

    async def complete(
        self, prompt: str, system: str = "", response_format: str = "json"
    ) -> Dict[str, Any]:
        """Try primary, fallback on failure."""
        try:
            return await self._primary.complete(prompt, system, response_format)
        except Exception as exc:
            logger.warning(
                "Primary provider %s failed: %s", self._primary.name(), exc
            )
            if self._fallback is None:
                raise
            logger.info("Falling back to %s", self._fallback.name())
            return await self._fallback.complete(prompt, system, response_format)

    # -- High-level helpers --------------------------------------------------

    async def classify_document(
        self,
        headers: List[str],
        sample_rows: List[Dict[str, Any]],
        filename: str,
    ) -> Dict[str, Any]:
        """Suggest a document category from column headers and sample data.

        Returns: { category: str, confidence: float, reason: str }
        """
        system = (
            "You are a financial document classifier for Indian accounting. "
            "Classify the uploaded file into one of: "
            "GST_Return, Bank_Statement, Trial_Balance, Ledger, "
            "Payroll, Purchase_Register, Sales_Register, TDS_Return, "
            "26AS, AIS, Invoice, Expense_Report, Other. "
            "Respond ONLY with valid JSON."
        )
        prompt = (
            f"File: {filename}\n"
            f"Headers: {json.dumps(headers)}\n"
            f"Sample rows (up to 5):\n{json.dumps(sample_rows[:5], default=str)}\n\n"
            "Classify this document. Return JSON with keys: "
            "category, confidence (0-1), reason."
        )
        return await self.complete(prompt, system, "json")

    async def suggest_column_mapping(
        self,
        source_headers: List[str],
        target_fields: List[str],
    ) -> Dict[str, Any]:
        """Suggest mapping from source columns to target fields.

        Returns: { mapping: {source_col: target_field}, confidence: float, reasoning: str }
        """
        system = (
            "You are a data-mapping assistant for accounting reconciliation. "
            "Given source CSV/Excel column headers and target schema fields, "
            "suggest the best mapping. Use null for unmapped source columns. "
            "Respond ONLY with valid JSON."
        )
        prompt = (
            f"Source headers: {json.dumps(source_headers)}\n"
            f"Target fields: {json.dumps(target_fields)}\n\n"
            "Suggest column mappings. Return JSON with keys: "
            "mapping ({source_col: target_field}), confidence (0-1), reasoning."
        )
        return await self.complete(prompt, system, "json")

    async def explain_risk(
        self,
        row_data: Dict[str, Any],
        triggered_rules: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Generate a natural language explanation of risk findings.

        Returns: { explanation: str, severity_suggestion: str, confidence: float }
        """
        system = (
            "You are a risk-assessment assistant for Indian financial audit. "
            "Explain in plain English why the given row triggered the listed rules. "
            "Suggest severity: low, medium, high, critical. "
            "Respond ONLY with valid JSON."
        )
        prompt = (
            f"Row data: {json.dumps(row_data, default=str)}\n"
            f"Triggered rules: {json.dumps(triggered_rules, default=str)}\n\n"
            "Explain the risk. Return JSON with keys: "
            "explanation, severity_suggestion, confidence (0-1)."
        )
        return await self.complete(prompt, system, "json")

    async def draft_working_paper(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """Draft a working paper section from reconciliation context.

        Returns: { title: str, content: str, sections: list[dict], confidence: float }
        """
        system = (
            "You are an audit working-paper drafter for Indian accounting. "
            "Given reconciliation context (variance, matched items, exceptions), "
            "draft a concise working paper. "
            "Respond ONLY with valid JSON."
        )
        prompt = (
            f"Context:\n{json.dumps(context, default=str)}\n\n"
            "Draft the working paper. Return JSON with keys: "
            "title, content (markdown), sections (list of {heading, body}), "
            "confidence (0-1)."
        )
        return await self.complete(prompt, system, "json")

    async def suggest_exception_summary(
        self, exceptions: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Summarize a group of related exceptions.

        Returns: { summary: str, recommended_actions: list[str], priority: str }
        """
        system = (
            "You are an exception-analysis assistant for reconciliation. "
            "Summarize the given exceptions and suggest concrete follow-up actions. "
            "Assign priority: low, medium, high. "
            "Respond ONLY with valid JSON."
        )
        prompt = (
            f"Exceptions:\n{json.dumps(exceptions, default=str)}\n\n"
            "Summarize. Return JSON with keys: "
            "summary, recommended_actions (list), priority."
        )
        return await self.complete(prompt, system, "json")


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------


def create_ai_manager() -> AiManager:
    """Create an AiManager from environment variables.

    Environment variables:
        GEMINI_API_KEY  – Google Gemini API key (primary)
        GEMINI_MODEL    – Gemini model id (default: gemini-2.0-flash)
        GROQ_API_KEY    – Groq API key (fallback)
        GROQ_MODEL      – Groq model id (default: qwen-2.5-32b)
    """
    gemini_key = os.environ.get("GEMINI_API_KEY", "")
    groq_key = os.environ.get("GROQ_API_KEY", "")
    gemini_model = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")
    groq_model = os.environ.get("GROQ_MODEL", "qwen-2.5-32b")

    primary: Optional[AiProvider] = None
    fallback: Optional[AiProvider] = None

    if gemini_key:
        try:
            primary = GeminiProvider(api_key=gemini_key, model=gemini_model)
            logger.info("AI primary provider: Gemini (%s)", gemini_model)
        except Exception:
            logger.exception("Failed to initialise Gemini provider")
    else:
        logger.warning("GEMINI_API_KEY not set – no AI primary provider")

    if groq_key:
        try:
            fallback = GroqProvider(api_key=groq_key, model=groq_model)
            logger.info("AI fallback provider: Groq (%s)", groq_model)
        except Exception:
            logger.exception("Failed to initialise Groq provider")
    else:
        logger.warning("GROQ_API_KEY not set – no AI fallback provider")

    if primary is None and fallback is None:
        logger.warning(
            "No AI providers configured – AI features will be unavailable"
        )

    return AiManager(
        primary=primary or _NullProvider(),
        fallback=fallback,
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _parse_json(text: str) -> Dict[str, Any]:
    """Best-effort extraction of a JSON object from model output."""
    text = text.strip()

    # Strip markdown code fences if present
    if text.startswith("```"):
        lines = text.split("\n")
        lines = lines[1:]  # drop opening fence
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()

    # Find first { … } block
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end > start:
        text = text[start : end + 1]

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        logger.error("Failed to parse JSON from model output: %s", text[:500])
        return {"raw": text, "_parseError": True}


class _NullProvider(AiProvider):
    """Stub provider used when no real provider is configured."""

    def name(self) -> str:
        return "null"

    def model(self) -> str:
        return "none"

    async def complete(
        self, prompt: str, system: str = "", response_format: str = "json"
    ) -> Dict[str, Any]:
        raise RuntimeError(
            "No AI provider configured. Set GEMINI_API_KEY or GROQ_API_KEY."
        )
