import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      navigate('/login');
    }
  };

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <Link to="/">💰 Ledger</Link>
      </div>
      {user ? (
        <div className="navbar-right">
          <Link to="/" className="nav-link">Dashboard</Link>
          <Link to="/transfer" className="nav-link">Transfer</Link>
          <span className="nav-user">Hi, {user.name}</span>
          <button onClick={handleLogout} className="btn btn-outline btn-sm">Logout</button>
        </div>
      ) : (
        <div className="navbar-right">
          <Link to="/login" className="nav-link">Login</Link>
          <Link to="/register" className="nav-link">Register</Link>
        </div>
      )}
    </nav>
  );
}
