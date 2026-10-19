import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { accounts } from '../api';

export default function Dashboard() {
  const [accountList, setAccountList] = useState([]);
  const [balances, setBalances] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchAccounts = useCallback(async () => {
    try {
      const data = await accounts.list();
      const accs = data.accounts || [];
      setAccountList(accs);

      // Fetch balance for each account
      const balanceMap = {};
      await Promise.all(
        accs.map(async (acc) => {
          try {
            const balData = await accounts.getBalance(acc._id);
            balanceMap[acc._id] = balData.balance;
          } catch {
            balanceMap[acc._id] = 'Error';
          }
        })
      );
      setBalances(balanceMap);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const handleCreateAccount = async () => {
    setCreating(true);
    setError('');
    try {
      await accounts.create();
      await fetchAccounts();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <div className="loading">Loading dashboard...</div>;

  const totalBalance = Object.values(balances).reduce(
    (sum, b) => (typeof b === 'number' ? sum + b : sum),
    0
  );

  return (
    <div className="dashboard">
      <div className="page-header">
        <h1>Dashboard</h1>
        <button
          onClick={handleCreateAccount}
          className="btn btn-primary"
          disabled={creating}
        >
          {creating ? 'Creating...' : '+ New Account'}
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="summary-cards">
        <div className="card summary-card">
          <div className="summary-icon">🏦</div>
          <h3>Total Accounts</h3>
          <p className="summary-value">{accountList.length}</p>
        </div>
        <div className="card summary-card">
          <div className="summary-icon">💰</div>
          <h3>Total Balance</h3>
          <p className="summary-value">₹{totalBalance.toLocaleString('en-IN')}</p>
        </div>
        <div className="card summary-card">
          <div className="summary-icon">🔄</div>
          <h3>Quick Action</h3>
          <Link to="/transfer" className="btn btn-primary btn-sm">Send Money</Link>
        </div>
      </div>

      <div className="section">
        <h2>Your Accounts</h2>
        {accountList.length === 0 ? (
          <div className="empty-state">
            <p>No accounts yet. Create one to get started!</p>
          </div>
        ) : (
          <div className="accounts-grid">
            {accountList.map((acc) => (
              <div key={acc._id} className={`card account-card status-${acc.status.toLowerCase()}`}>
                <div className="account-header">
                  <span className={`badge badge-${acc.status.toLowerCase()}`}>
                    {acc.status}
                  </span>
                  <span className="account-currency">{acc.currency}</span>
                </div>
                <div className="account-id">
                  {acc._id.slice(-8).toUpperCase()}
                </div>
                <div className="account-balance">
                  ₹{typeof balances[acc._id] === 'number'
                    ? balances[acc._id].toLocaleString('en-IN')
                    : '...'}
                </div>
                <div className="account-date">
                  Created {new Date(acc.createdAt).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
