import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, loadSession, saveSession, setSessionExpiredHandler } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(loadSession);

  const update = useCallback((next) => {
    setSession(next);
    saveSession(next);
  }, []);

  const adopt = useCallback(
    (payload) => {
      const prev = loadSession();
      const branchId =
        payload.branches.find((b) => b.id === prev?.branchId)?.id ||
        payload.user.default_branch ||
        payload.branches[0]?.id ||
        null;
      update({ ...payload, branchId });
    },
    [update],
  );

  const login = useCallback(
    async (business, username, password) => adopt(await api("/auth/login/", { method: "POST", body: { business, username, password } })),
    [adopt],
  );

  const register = useCallback(
    async (form) => adopt(await api("/auth/register/", { method: "POST", body: form })),
    [adopt],
  );

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout/", { method: "POST" });
    } catch {
      /* already logged out */
    }
    update(null);
  }, [update]);

  const refresh = useCallback(async () => adopt(await api("/auth/me/")), [adopt]);

  useEffect(() => {
    setSessionExpiredHandler(() => update(null));
    if (session?.access) refresh().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(() => {
    const perms = new Set(session?.user?.permissions || []);
    return {
      session,
      user: session?.user,
      business: session?.business,
      branches: session?.branches || [],
      branch: session?.branches?.find((b) => b.id === session?.branchId),
      can: (code) => perms.has(code),
      setBranch: (id) => update({ ...session, branchId: Number(id) }),
      setBusiness: (business) => update({ ...session, business }),
      login,
      register,
      logout,
      refresh,
    };
  }, [session, login, register, logout, refresh, update]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
