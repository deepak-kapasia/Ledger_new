import { createContext, useContext, useState, useEffect } from 'react';
import { auth } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // FIX (Bug 6): Initialize user from localStorage so session survives page refresh
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('ledger_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  // Keep localStorage in sync whenever user state changes
  useEffect(() => {
    if (user) {
      localStorage.setItem('ledger_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('ledger_user');
    }
  }, [user]);

  // Clear stale browser sessions when the backend rejects the current token.
  useEffect(() => {
    const handleAuthExpired = () => setUser(null);
    window.addEventListener('ledger:auth-expired', handleAuthExpired);
    return () => window.removeEventListener('ledger:auth-expired', handleAuthExpired);
  }, []);

  const login = async (email, password) => {
    const data = await auth.login(email, password);
    setUser(data.user);
    return data;
  };

  const register = async (name, email, password) => {
    const data = await auth.register(name, email, password);
    setUser(data.user);
    return data;
  };

  const logout = async () => {
    try {
      await auth.logout();
    } finally {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
