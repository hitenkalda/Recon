export const currentUser = (req) => {
    if (!req.user)
        throw new Error('request.user missing (requireAuth not applied)');
    return req.user;
};
//# sourceMappingURL=context.js.map