import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { accounts, transactions } from '../api';

function generateIdempotencyKey() {
  return `txn_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}

export default function Transfer() {
  const navigate = useNavigate();
  const [accountList, setAccountList] = useState([]);
  const [balances, setBalances] = useState({});
  const [fromAccount, setFromAccount] = useState('');
  const [toAccount, setToAccount] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingAccounts, setFetchingAccounts] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await accounts.list();
        const accs = data.accounts || [];
        setAccountList(accs);

        const balanceMap = {};
        await Promise.all(
          accs.map(async (acc) => {
            try {
              const balData = await accounts.getBalance(acc._id);
              balanceMap[acc._id] = balData.balance;
            } catch {
              balanceMap[acc._id] = 0;
            }
          })
        );
        setBalances(balanceMap);
      } catch (err) {
        setError(err.message);
      } finally {
        setFetchingAccounts(false);
      }
    };
    fetchData();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (fromAccount === toAccount) {
      setError('Source and destination accounts must be different');
      return;
    }

    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      setError('Amount must be greater than 0');
      return;
    }

    setLoading(true);
    try {
      const idempotencyKey = generateIdempotencyKey();
      const data = await transactions.create(fromAccount, toAccount, numAmount, idempotencyKey);
      setSuccess(data.message || 'Transaction completed successfully!');
      setAmount('');
      setFromAccount('');
      setToAccount('');

      // Refresh balances
      const balanceMap = {};
      await Promise.all(
        accountList.map(async (acc) => {
          try {
            const balData = await accounts.getBalance(acc._id);
            balanceMap[acc._id] = balData.balance;
          } catch {
            balanceMap[acc._id] = 0;
          }
        })
      );
      setBalances(balanceMap);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (fetchingAccounts) return <div className="loading">Loading accounts...</div>;

  return (
    <div className="transfer-page">
      <div className="page-header">
        <h1>Transfer Money</h1>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {accountList.length < 2 ? (
        <div className="card">
          <div className="empty-state">
            <p>You need at least 2 accounts to make a transfer.</p>
            <p>You currently have {accountList.length} account(s).</p>
            <button onClick={() => navigate('/')} className="btn btn-primary">
              Go to Dashboard to create accounts
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="form-card">
          <div className="form-group">
            <label>From Account</label>
            <select
              value={fromAccount}
              onChange={(e) => setFromAccount(e.target.value)}
              required
            >
              <option value="">Select source account</option>
              {accountList
                .filter((acc) => acc.status === 'ACTIVE')
                .map((acc) => (
                  <option key={acc._id} value={acc._id}>
                    ...{acc._id.slice(-8).toUpperCase()} — Balance: ₹
                    {typeof balances[acc._id] === 'number'
                      ? balances[acc._id].toLocaleString('en-IN')
                      : '...'}{' '}
                    ({acc.currency})
                  </option>
                ))}
            </select>
          </div>

          <div className="form-group">
            <label>To Account</label>
            <select
              value={toAccount}
              onChange={(e) => setToAccount(e.target.value)}
              required
            >
              <option value="">Select destination account</option>
              {accountList
                .filter((acc) => acc.status === 'ACTIVE')
                .map((acc) => (
                  <option key={acc._id} value={acc._id}>
                    ...{acc._id.slice(-8).toUpperCase()} — Balance: ₹
                    {typeof balances[acc._id] === 'number'
                      ? balances[acc._id].toLocaleString('en-IN')
                      : '...'}{' '}
                    ({acc.currency})
                  </option>
                ))}
            </select>
          </div>

          <div className="form-group">
            <label>Amount (₹)</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              placeholder="Enter amount"
            />
          </div>

          {fromAccount && (
            <div className="transfer-summary">
              <p>
                Available balance: <strong>₹{typeof balances[fromAccount] === 'number'
                  ? balances[fromAccount].toLocaleString('en-IN')
                  : '...'}</strong>
              </p>
            </div>
          )}

          <div className="form-actions">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
            >
              {loading ? '⏳ Processing... (may take ~15s)' : '💸 Send Money'}
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => navigate('/')}
            >
              Cancel
            </button>
          </div>

          {loading && (
            <div className="processing-note">
              <p>⏳ Transaction is being processed. This may take up to 15 seconds due to the backend's double-entry verification.</p>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
