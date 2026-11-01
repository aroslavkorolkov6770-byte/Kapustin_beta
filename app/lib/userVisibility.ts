export type WorkspaceUserVisibility = {
    systemAccount?: boolean;
    ghostAccount?: boolean;
    canSwitchMode?: boolean;
};

export const isSystemWorkspaceAccount = (user: WorkspaceUserVisibility | null | undefined) => {
    return Boolean(user?.systemAccount || user?.ghostAccount || user?.canSwitchMode);
};

export const getVisibleWorkspaceUsers = <T extends WorkspaceUserVisibility>(users: T[]) => {
    return users.filter((user) => !isSystemWorkspaceAccount(user));
};
