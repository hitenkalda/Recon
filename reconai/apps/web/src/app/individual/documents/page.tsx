'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { GlassCard, Spinner, ErrorState, Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/primitives';

interface DocumentItem {
  id: string;
  originalName: string;
  fileName: string;
  mime: string;
  size: number;
  category: string | null;
  status: string;
  createdAt: string;
}

interface DocumentsData {
  items: DocumentItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export default function DocumentsPage() {
  const [data, setData] = useState<DocumentsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    api.get<DocumentsData>('/individual/documents?page=1&pageSize=50')
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      // Upload init
      const initRes = await api.post<{ uploadId: string; uploads: Array<{ fieldId: string; presignedUrl: string }> }>(
        '/individual/documents/upload-init',
        {
          files: Array.from(files).map((f) => ({
            name: f.name,
            mime: f.type,
            size: f.size,
          })),
        }
      );

      // Upload each file
      for (const upload of initRes.uploads) {
        const file = files[Array.from(files).findIndex(f => f.name === upload.fieldId)];
        if (!file) continue;
        await fetch(upload.presignedUrl, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type },
        });
      }

      // Confirm all uploads
      for (const upload of initRes.uploads) {
        await api.post(`/individual/documents/${upload.fieldId}/confirm`, {
          category: 'general',
        });
      }

      // Refresh list
      const refreshed = await api.get<DocumentsData>('/individual/documents?page=1&pageSize=50');
      setData(refreshed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  if (loading) return <Spinner label="Loading..." />;
  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />;

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white" style={{ fontFamily: 'var(--font-geist)' }}>
          Documents
        </h1>
        <label className="cursor-pointer">
          <input type="file" multiple className="hidden" onChange={handleFileUpload} accept=".csv,.xlsx,.xls,.pdf" />
          <Button size="sm" variant="primary" icon="upload" loading={uploading}>
            Upload
          </Button>
        </label>
      </div>

      {/* Documents List */}
      <div className="flex flex-col gap-2">
        {data?.items.length === 0 ? (
          <GlassCard className="p-10 flex flex-col items-center justify-center text-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-center text-mine-400">
              <span className="text-2xl">📄</span>
            </div>
            <div className="text-sm font-medium text-white">No documents yet</div>
            <div className="text-xs text-mine-400 max-w-sm">
              Upload CSV, Excel, or PDF files to start reconciling
            </div>
            <label className="cursor-pointer">
              <input type="file" multiple className="hidden" onChange={handleFileUpload} accept=".csv,.xlsx,.xls,.pdf" />
              <Button size="sm" variant="secondary">
                Choose Files
              </Button>
            </label>
          </GlassCard>
        ) : (
          data?.items.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between px-4 py-3 rounded-lg bg-white/[0.02] border border-white/[0.05]"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-white/[0.04] border border-white/10 flex items-center justify-center">
                  <span className="text-[10px] text-mine-400 font-mono">
                    {doc.mime.split('/')[1]?.toUpperCase().slice(0, 4) ?? 'DOC'}
                  </span>
                </div>
                <div>
                  <div className="text-[13px] font-medium text-slate-200 truncate max-w-[240px]">
                    {doc.originalName}
                  </div>
                  <div className="text-[11px] text-mine-400 mt-0.5">
                    {formatSize(doc.size)} · {new Date(doc.createdAt).toLocaleDateString('en-US')}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {doc.category ? (
                  <Badge tone="dim">{doc.category}</Badge>
                ) : null}
                <Badge tone={doc.status === 'stored' ? 'success' : doc.status === 'uploaded' ? 'blue' : 'dim'}>
                  {doc.status}
                </Badge>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
