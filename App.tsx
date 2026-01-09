
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { db } from './firebaseService';
import { AppConfig, UserData, Withdrawal } from './types';

// Constants
const BOT_USERNAME = "beeclaimer_bot";
const ADMIN_PASSWORD = "Ahmednnn3";
const TICK_INTERVAL = 1000;
const ACTION_DURATION = 5 * 60 * 1000; // 5 minutes

const App: React.FC = () => {
  // --- State ---
  const [userId, setUserId] = useState<string>('');
  const [config, setConfig] = useState<AppConfig>({
    rewards: { mine: 0.00001, faucet: 0.00001, daily: 0.0001 },
    ads: { mine: "#", faucet: "#", daily: "#", double: "#" },
    limits: { min_withdraw: 0.0001, font_percent: 10, ref_bonus: 0.0001 },
    api_key: ""
  });
  const [user, setUser] = useState<UserData | null>(null);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [activePage, setActivePage] = useState<'home' | 'ref'>('home');
  const [modals, setModals] = useState<{ [key: string]: boolean }>({
    withdraw: false,
    success: false,
    admin: false,
    password: false
  });
  const [successData, setSuccessData] = useState({ amt: 0, title: '', icon: '' });
  const [timers, setTimers] = useState<{ [key: string]: string }>({
    mine: 'Ready',
    faucet: 'Ready',
    daily: 'Ready'
  });
  const [clickCount, setClickCount] = useState(0);
  const [adminPassInput, setAdminPassInput] = useState('');
  
  // --- Global Stats ---
  const [globalStats, setGlobalStats] = useState({ totalUsers: 0, totalPaid: 0 });

  // --- Admin Specific State ---
  const [adminTab, setAdminTab] = useState<'stats' | 'withdrawals' | 'users' | 'broadcast'>('stats');
  const [allUsers, setAllUsers] = useState<UserData[]>([]);
  const [allWithdrawals, setAllWithdrawals] = useState<(Withdrawal & { id: string })[]>([]);
  const [broadcastMsg, setBroadcastMsg] = useState('');

  // --- Refs ---
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Helpers ---
  const getTele = () => (window as any).Telegram?.WebApp;

  const triggerAd = (callback: () => void) => {
    const showAd = (window as any).show_10428594;
    if (typeof showAd === 'function') {
      showAd().then(() => callback()).catch(() => callback());
    } else {
      callback();
    }
  };

  const showSuccess = (amt: number, title: string, icon: string) => {
    setSuccessData({ amt, title, icon });
    setModals(prev => ({ ...prev, success: true }));
  };

  // --- Initialization ---
  useEffect(() => {
    const tele = getTele();
    if (tele) {
      tele.ready();
      tele.expand();
      const teleUser = tele.initDataUnsafe?.user;
      const uid = teleUser ? teleUser.id.toString() : (localStorage.getItem('bee_uid') || `user_${Math.random().toString(36).substr(2, 9)}`);
      localStorage.setItem('bee_uid', uid);
      setUserId(uid);
    } else {
      const uid = localStorage.getItem('bee_uid') || `user_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('bee_uid', uid);
      setUserId(uid);
    }
  }, []);

  // --- Global Stats Sync ---
  useEffect(() => {
    const usersCountRef = db.ref('users');
    usersCountRef.on('value', (snap) => {
      if (snap.exists()) {
        const count = snap.numChildren();
        setGlobalStats(prev => ({ ...prev, totalUsers: count + 1240 })); 
      }
    });

    const paidRef = db.ref('withdrawals').orderByChild('status').equalTo('PAID');
    paidRef.on('value', (snap) => {
      let total = 0;
      snap.forEach(child => { total += (child.val().amount || 0); });
      setGlobalStats(prev => ({ ...prev, totalPaid: total + 12.45 }));
    });

    return () => {
      usersCountRef.off();
      paidRef.off();
    };
  }, []);

  // --- Firebase Sync ---
  useEffect(() => {
    if (!userId) return;

    const configRef = db.ref('app_config');
    configRef.on('value', (snap) => {
      if (snap.exists()) setConfig(snap.val());
    });

    const userRef = db.ref('users/' + userId);
    userRef.on('value', (snap) => {
      if (!snap.exists()) {
        const tele = getTele();
        const params = new URLSearchParams(window.location.search);
        const referrerId = tele?.initDataUnsafe?.start_param || params.get('tgWebAppStartParam');

        const newUser: UserData = {
          uid: userId,
          balance: 0,
          friends: 0,
          refEarned: 0,
          joined: Date.now()
        };

        if (referrerId && referrerId !== userId) {
          newUser.referrer = referrerId;
          db.ref(`users/${referrerId}`).transaction(rData => {
            if (rData) {
              rData.friends = (rData.friends || 0) + 1;
              rData.balance = (rData.balance || 0) + (config.limits.ref_bonus || 0.0001);
              rData.refEarned = (rData.refEarned || 0) + (config.limits.ref_bonus || 0.0001);
            }
            return rData;
          });
        }
        userRef.set(newUser);
      } else {
        setUser(snap.val());
      }
    });

    const withdrawRef = db.ref('withdrawals').orderByChild('uid').equalTo(userId);
    withdrawRef.on('value', (snap) => {
      if (snap.exists()) {
        const list: Withdrawal[] = [];
        snap.forEach(child => { list.push(child.val()); });
        setWithdrawals(list.reverse());
      }
    });

    return () => {
      configRef.off();
      userRef.off();
      withdrawRef.off();
    };
  }, [userId, config.limits.ref_bonus]);

  // --- Admin Sync ---
  useEffect(() => {
    if (!modals.admin) return;

    const usersRef = db.ref('users');
    usersRef.on('value', (snap) => {
      if (snap.exists()) {
        const list: UserData[] = [];
        snap.forEach(child => { list.push(child.val()); });
        setAllUsers(list);
      }
    });

    const withdrawsRef = db.ref('withdrawals');
    withdrawsRef.on('value', (snap) => {
      if (snap.exists()) {
        const list: (Withdrawal & { id: string })[] = [];
        snap.forEach(child => { list.push({ ...child.val(), id: child.key as string }); });
        setAllWithdrawals(list.reverse());
      }
    });

    return () => {
      usersRef.off();
      withdrawsRef.off();
    };
  }, [modals.admin]);

  // --- Timer Logic ---
  const tick = useCallback(() => {
    const now = Date.now();
    const newTimers: { [key: string]: string } = {};

    ['mine', 'faucet'].forEach(type => {
      const endTime = parseInt(localStorage.getItem(type + '_end') || '0');
      const isActive = localStorage.getItem(type + '_active') === 'true';

      if (endTime && endTime > now) {
        const diff = Math.ceil((endTime - now) / 1000);
        newTimers[type] = `${Math.floor(diff / 60)}m ${diff % 60}s`;
      } else {
        if (isActive) {
          localStorage.setItem(type + '_active', 'false');
          addReward(config.rewards[type as keyof typeof config.rewards]);
          showSuccess(config.rewards[type as keyof typeof config.rewards], type.toUpperCase(), type === 'mine' ? "⛏️" : "🍯");
        }
        newTimers[type] = 'Ready';
      }
    });

    const lastDaily = parseInt(localStorage.getItem('last_daily') || '0');
    if (lastDaily && (now - lastDaily < 86400000)) {
      newTimers['daily'] = 'Claimed';
    } else {
      newTimers['daily'] = 'Ready';
    }

    setTimers(newTimers);
  }, [config.rewards]);

  useEffect(() => {
    timerRef.current = setInterval(tick, TICK_INTERVAL);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [tick]);

  // --- Actions ---
  const addReward = (amt: number) => {
    if (!user) return;
    const newBalance = (user.balance || 0) + amt;
    db.ref('users/' + userId).update({ balance: newBalance });

    if (user.referrer) {
      const commission = amt * (config.limits.ref_percent / 100);
      db.ref('users/' + user.referrer).transaction(rData => {
        if (rData) {
          rData.balance = (rData.balance || 0) + commission;
          rData.refEarned = (rData.refEarned || 0) + commission;
        }
        return rData;
      });
    }
  };

  const startAction = (type: 'mine' | 'faucet') => {
    triggerAd(() => {
      if (config.ads[type] !== "#") getTele()?.openLink(config.ads[type], { try_instant_view: true });
      localStorage.setItem(type + '_end', (Date.now() + ACTION_DURATION).toString());
      localStorage.setItem(type + '_active', 'true');
    });
  };

  const claimDaily = () => {
    const last = parseInt(localStorage.getItem('last_daily') || '0');
    if (!last || (Date.now() - last > 86400000)) {
      triggerAd(() => {
        if (config.ads.daily !== "#") getTele()?.openLink(config.ads.daily, { try_instant_view: true });
        addReward(config.rewards.daily);
        localStorage.setItem('last_daily', Date.now().toString());
        showSuccess(config.rewards.daily, "Daily Bonus", "🎁");
      });
    }
  };

  const speedUp = () => {
    triggerAd(() => {
      const currentEnd = parseInt(localStorage.getItem('mine_end') || '0');
      if (currentEnd > Date.now()) {
        localStorage.setItem('mine_end', (currentEnd - 120000).toString());
      }
    });
  };

  const handleTitleClick = () => {
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    const newCount = clickCount + 1;
    setClickCount(newCount);
    if (newCount >= 8) {
      setModals(prev => ({ ...prev, password: true }));
      setClickCount(0);
    } else {
      clickTimerRef.current = setTimeout(() => setClickCount(0), 5000);
    }
  };

  const verifyAdminPassword = () => {
    if (adminPassInput === ADMIN_PASSWORD) {
      setModals(prev => ({ ...prev, admin: true, password: false }));
      setAdminPassInput('');
    } else {
      getTele()?.showAlert("Incorrect Password!");
      setAdminPassInput('');
    }
  };

  const handleWithdraw = async () => {
    const email = (document.getElementById('emailInp') as HTMLInputElement).value;
    const amt = parseFloat((document.getElementById('withdrawAmtInp') as HTMLInputElement).value);

    if (!email.includes('@') || isNaN(amt) || amt < config.limits.min_withdraw || amt > (user?.balance || 0)) {
      getTele()?.showAlert("Invalid inputs or insufficient balance.");
      return;
    }

    const btn = document.getElementById('withdrawBtn') as HTMLButtonElement;
    btn.disabled = true;
    btn.innerText = "Processing Instant Payout...";

    let status: 'PENDING' | 'PAID' = 'PENDING';

    if (config.api_key && config.api_key !== "") {
      try {
        const formData = new FormData();
        formData.append('api_key', config.api_key);
        formData.append('amount', (amt * 100000000).toString());
        formData.append('currency', 'TON');
        formData.append('to', email);

        const response = await fetch('https://faucetpay.io/api/v1/send', {
          method: 'POST',
          body: formData
        });

        const result = await response.json();
        if (result.status === 200) {
          status = 'PAID';
          getTele()?.showAlert("Success! Instant payout sent to your FaucetPay account.");
        } else {
          getTele()?.showAlert("API Error: " + result.message);
        }
      } catch (err) {
        getTele()?.showAlert("Connection failed. Saved as pending.");
      }
    } else {
      getTele()?.showAlert("Manual Mode: Request saved.");
    }

    db.ref('withdrawals').push({
      uid: userId,
      email,
      amount: amt,
      status: status,
      time: Date.now()
    }).then(() => {
      db.ref('users/' + userId).update({ balance: (user?.balance || 0) - amt });
      setModals(prev => ({ ...prev, withdraw: false }));
      btn.disabled = false;
      btn.innerText = "Request Payout";
    });
  };

  const copyRef = () => {
    const url = `https://t.me/${BOT_USERNAME}?start=${userId}`;
    navigator.clipboard.writeText(url);
    getTele()?.showAlert('Link Copied Successfully!');
  };

  const updateWithdrawalStatus = (id: string, status: 'PAID' | 'REJECTED', uid: string, amount: number) => {
    db.ref(`withdrawals/${id}`).update({ status });
    if (status === 'REJECTED') {
      db.ref(`users/${uid}`).transaction(u => {
        if (u) u.balance = (u.balance || 0) + amount;
        return u;
      });
    }
    getTele()?.showAlert(`Withdrawal marked as ${status}`);
  };

  const updateSystemBalance = (uid: string) => {
    const newBal = prompt("Enter new balance:");
    if (newBal !== null) {
      db.ref(`users/${uid}`).update({ balance: parseFloat(newBal) });
    }
  };

  const sendBroadcast = () => {
    if (!broadcastMsg.trim()) return;
    db.ref('broadcasts').push({ message: broadcastMsg, time: Date.now() }).then(() => {
      getTele()?.showAlert("Broadcast sent!");
      setBroadcastMsg('');
    });
  };

  return (
    <div className="container mx-auto max-w-[420px] px-3 h-screen flex flex-col relative font-sans">
      {/* Restored Header Title */}
      <h1 className={`text-gold font-black tracking-widest text-xl text-center py-4 uppercase cursor-pointer select-none transition-all ${clickCount > 0 ? 'scale-110 blur-[1px]' : ''}`} onClick={handleTitleClick}>BeeClaimer</h1>
      
      <div className="flex-grow overflow-y-auto pb-28">
        {activePage === 'home' ? (
          <div className="space-y-4 animate-in fade-in duration-300">
            {/* Restored Global Stats Bar */}
            <div className="flex gap-2 mb-2">
              <div className="flex-1 bg-white/5 border border-white/10 rounded-2xl py-2 px-3 flex items-center gap-2">
                <span className="text-blue-400 text-lg">⚡</span>
                <div>
                  <div className="text-[10px] text-gray-500 font-bold uppercase">Live Miners</div>
                  <div className="text-xs font-black text-white">{globalStats.totalUsers.toLocaleString()}</div>
                </div>
              </div>
              <div className="flex-1 bg-white/5 border border-white/10 rounded-2xl py-2 px-3 flex items-center gap-2">
                <span className="text-green-400 text-lg">💰</span>
                <div>
                  <div className="text-[10px] text-gray-500 font-bold uppercase">Total Paid</div>
                  <div className="text-xs font-black text-white">{globalStats.totalPaid.toFixed(2)} TON</div>
                </div>
              </div>
            </div>

            {/* Balance Card */}
            <div className="bg-gradient-to-br from-[#1e1b0a] to-black rounded-[25px] border border-gold p-6 text-center shadow-lg relative overflow-hidden">
               <div className="absolute top-0 right-0 w-32 h-32 bg-gold/10 blur-3xl -mr-10 -mt-10 rounded-full"></div>
              <span className="text-[11px] font-extrabold text-gold/80 uppercase tracking-widest">Total Available Balance</span>
              <div className="flex items-center justify-center gap-2 text-4xl md:text-5xl font-black my-2">
                <span className="drop-shadow-[0_0_8px_#FFD700] text-[32px]">💎</span>
                <span className="tabular-nums">{user?.balance?.toFixed(5) || '0.00000'}</span>
                <small className="text-sm opacity-40">TON</small>
              </div>
              <button className="bg-gold text-black px-8 py-3 rounded-2xl font-black text-xs uppercase mt-2 w-3/4 mx-auto relative z-10 shadow-xl shadow-gold/20 active:scale-95 transition-transform" onClick={() => setModals(prev => ({ ...prev, withdraw: true }))}>Withdraw Funds</button>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div className={`flex flex-col items-center justify-between bg-gradient-to-br from-[#2d1b4e] to-[#160d26] border border-[#6c4ab6] rounded-[22px] p-4 text-center min-h-[160px] ${timers.daily === 'Ready' ? 'animate-pulse-gold' : ''}`}>
                <div className="flex flex-col items-center"><span className={`text-4xl mb-2 ${timers.daily === 'Ready' ? 'animate-wobble' : ''}`}>🎁</span><h3 className="text-[13px] text-[#d1b3ff] font-bold">Daily Gift</h3><span className="text-gold font-black text-[11px] mb-1">(+{config.rewards.daily.toFixed(4)})</span><span className="bg-black/30 text-white text-[12px] font-extrabold px-3 py-1 rounded-xl">{timers.daily}</span></div>
                <button disabled={timers.daily !== 'Ready'} className="bg-gold text-black w-full py-3 rounded-2xl font-black text-[11px] uppercase disabled:bg-black/40" onClick={claimDaily}>Claim Bonus</button>
              </div>
              
              <div className={`relative flex flex-col items-center justify-between bg-gradient-to-br from-[#0f2d4e] to-[#061626] border border-[#007bff] rounded-[22px] p-4 text-center min-h-[160px] ${timers.mine === 'Ready' ? 'animate-pulse-gold' : ''}`}>
                {timers.mine !== 'Ready' && <div className="absolute -top-2 right-2 bg-red-600 text-white text-[9px] font-black px-3 py-1 rounded-full shadow-lg" onClick={speedUp}>⚡ SPEED UP</div>}
                <div className="flex flex-col items-center"><span className={`text-4xl mb-2 ${timers.mine === 'Ready' ? 'animate-wobble' : ''}`}>⛏️</span><h3 className="text-[13px] text-[#b3d9ff] font-bold">Mining</h3><span className="text-blue-500 font-black text-[11px] mb-1">(+{config.rewards.mine.toFixed(5)})</span><span className="bg-black/30 text-white text-[12px] font-extrabold px-3 py-1 rounded-xl">{timers.mine}</span></div>
                <button disabled={timers.mine !== 'Ready'} className="bg-gold text-black w-full py-3 rounded-2xl font-black text-[11px] uppercase disabled:bg-black/40" onClick={() => startAction('mine')}>Start</button>
              </div>
              
              <div className={`col-span-2 flex items-center justify-between bg-gradient-to-br from-[#4e3a0f] to-[#261c06] border border-[#ff9900] rounded-[22px] p-4 h-[90px] ${timers.faucet === 'Ready' ? 'animate-pulse-gold' : ''}`}>
                <div className="flex items-center gap-4"><span className={`text-4xl ${timers.faucet === 'Ready' ? 'animate-wobble' : ''}`}>🍯</span><div className="text-left"><h3 className="text-sm text-[#ffd9b3] font-bold">Honey Faucet</h3><div className="text-gold font-black text-[10px] mb-1">(+{config.rewards.faucet.toFixed(5)})</div><span className="bg-black/30 text-white text-[12px] font-extrabold px-3 py-1 rounded-xl">{timers.faucet}</span></div></div>
                <button disabled={timers.faucet !== 'Ready'} className="bg-gold text-black px-6 py-3 rounded-2xl font-black text-xs uppercase disabled:bg-black/40" onClick={() => startAction('faucet')}>Claim</button>
              </div>
            </div>
          </div>
        ) : (
          <div className="animate-in slide-in-from-right duration-300 space-y-4">
             {/* Referral Hub remains same */}
            <div className="bg-gradient-to-br from-[#1e1b0a] to-black rounded-[30px] border border-gold p-8 text-center relative overflow-hidden">
                <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-gold/5 blur-3xl rounded-full"></div>
                <span className="text-6xl mb-4 block animate-bounce">👥</span>
                <h2 className="text-2xl font-black mb-6 uppercase tracking-widest text-gold">Referral Hub</h2>
                
                <div className="grid grid-cols-2 gap-3 mb-6">
                   <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                     <small className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Total Friends</small>
                     <span className="text-2xl font-black text-white">{user?.friends || 0}</span>
                   </div>
                   <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                     <small className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Earned</small>
                     <span className="text-2xl font-black text-gold">{user?.refEarned?.toFixed(5) || '0.00000'}</span>
                   </div>
                </div>

                <div className="bg-gold/10 border border-gold/20 p-4 rounded-2xl text-xs text-gold mb-6 font-bold leading-relaxed">
                  🤝 اكسب <span className="text-white text-sm">0.0001 TON</span> فوراً عن كل صديق يسجل في الموقع!
                </div>
                
                <div className="bg-black border border-dashed border-gold/30 p-4 rounded-2xl text-[10px] break-all text-gray-400 mb-6 font-mono select-all">
                  {`https://t.me/${BOT_USERNAME}?start=${userId}`}
                </div>
                
                <button className="bg-gold text-black w-full py-4 rounded-2xl font-black text-xs uppercase shadow-xl shadow-gold/20 active:scale-95 transition-transform" onClick={copyRef}>Copy Invite Link</button>
            </div>
          </div>
        )}
      </div>

      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[92%] max-w-[380px] bg-[#121212]/95 border border-white/10 h-[75px] rounded-[30px] flex backdrop-blur-2xl z-50 shadow-2xl shadow-black">
        <div className={`flex-1 flex flex-col items-center justify-center cursor-pointer transition-all ${activePage === 'home' ? 'text-gold' : 'opacity-30'}`} onClick={() => setActivePage('home')}>
          <span className="text-2xl">🏠</span>
          <span className="text-[10px] font-black mt-1 uppercase">Home</span>
        </div>
        <div className={`flex-1 flex flex-col items-center justify-center cursor-pointer transition-all ${activePage === 'ref' ? 'text-gold' : 'opacity-30'}`} onClick={() => setActivePage('ref')}>
          <span className="text-2xl">👥</span>
          <span className="text-[10px] font-black mt-1 uppercase">Friends</span>
        </div>
      </div>

      {/* Admin and Modals remain Same */}
      {modals.password && (
        <div className="fixed inset-0 bg-black/95 z-[999] flex items-center justify-center p-6 backdrop-blur-xl">
          <div className="bg-[#111] w-full max-w-[320px] rounded-[30px] border border-gold/50 p-8 text-center animate-in zoom-in duration-300">
            <h2 className="text-gold text-xl font-black mb-6 uppercase tracking-tighter">Enter Admin Code</h2>
            <input type="password" value={adminPassInput} onChange={(e) => setAdminPassInput(e.target.value)} placeholder="••••••••" className="w-full bg-black border border-gold/20 rounded-xl p-4 text-center text-gold text-lg tracking-[10px] outline-none mb-6 focus:border-gold" />
            <div className="flex gap-2">
              <button className="flex-1 bg-white/5 text-gray-400 py-3 rounded-xl font-bold text-xs" onClick={() => { setModals(prev => ({ ...prev, password: false })); setAdminPassInput(''); }}>CANCEL</button>
              <button className="flex-1 bg-gold text-black py-3 rounded-xl font-black text-xs" onClick={verifyAdminPassword}>ACCESS</button>
            </div>
          </div>
        </div>
      )}

      {/* Withdraw Modal */}
      {modals.withdraw && (
        <div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-6 backdrop-blur-md">
          <div className="bg-[#0f0f0f] w-full max-w-[360px] rounded-[35px] border border-gold p-8 text-center animate-in zoom-in duration-300 overflow-y-auto max-h-[90vh]">
            <h2 className="text-gold text-2xl font-black mb-2">Withdraw</h2>
            <p className="text-xs text-gray-500 mb-6 font-bold">Min Payout: <span className="text-white">{config.limits.min_withdraw.toFixed(4)}</span> TON</p>
            <input type="email" id="emailInp" placeholder="FaucetPay Email Address" className="w-full bg-black border border-white/10 rounded-2xl p-4 text-center text-sm outline-none mb-3 focus:border-gold transition-all" />
            <div className="relative mb-3">
              <input type="number" id="withdrawAmtInp" placeholder="Amount to Withdraw" className="w-full bg-black border border-white/10 rounded-2xl p-4 text-center text-sm outline-none focus:border-gold transition-all" />
              <button className="absolute right-3 top-1/2 -translate-y-1/2 bg-gold text-black px-3 py-1 rounded-lg text-[10px] font-black" onClick={() => { const input = (document.getElementById('withdrawAmtInp') as HTMLInputElement); if (input) input.value = (user?.balance || 0).toFixed(5); }}>MAX</button>
            </div>
            <button id="withdrawBtn" className="bg-gold text-black w-full py-4 rounded-2xl font-black text-xs uppercase mb-6 shadow-xl shadow-gold/20 active:scale-95" onClick={handleWithdraw}>Request Payout</button>
            <div className="mt-6 text-sm font-bold opacity-60 cursor-pointer hover:opacity-100 transition-opacity" onClick={() => setModals(prev => ({ ...prev, withdraw: false }))}>Close Window</div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {modals.success && (
        <div className="fixed inset-0 bg-black/90 z-[101] flex items-center justify-center p-6 backdrop-blur-md">
          <div className="bg-[#0f0f0f] w-full max-w-[360px] rounded-[35px] border border-gold p-8 text-center animate-in zoom-in duration-300">
            <span className="text-7xl mb-4 block animate-bounce">{successData.icon || '✅'}</span>
            <h2 className="text-2xl font-black mb-4 uppercase tracking-widest">{successData.title || 'Awesome!'}</h2>
            <div className="flex items-center justify-center gap-3 text-gold text-4xl font-black mb-8"><span className="text-[30px]">💎</span><span>+{successData.amt.toFixed(5)}</span></div>
            <button className="bg-gold text-black w-full py-4 rounded-2xl font-black text-xs uppercase mb-3" onClick={() => setModals(prev => ({ ...prev, success: false }))}>Collect Reward</button>
          </div>
        </div>
      )}

      {/* Admin Panel */}
      {modals.admin && (
        <div className="fixed inset-0 bg-black z-[200] flex flex-col animate-in slide-in-from-bottom duration-300">
          <div className="bg-[#111] border-b border-gold/20 p-6 flex justify-between items-center"><div><h2 className="text-gold text-xl font-black">SUPER AMC v8.0</h2><div className="text-[9px] text-gray-500">REALTIME CONTROL</div></div><button className="text-red-500 border border-red-500/50 px-4 py-2 rounded-xl font-black text-xs" onClick={() => setModals(prev => ({ ...prev, admin: false }))}>X</button></div>
          
          <div className="flex bg-[#0a0a0a] border-b border-white/5 overflow-x-auto shrink-0">
            {['stats', 'withdrawals', 'users', 'broadcast'].map(tab => (
              <button key={tab} onClick={() => setAdminTab(tab as any)} className={`px-6 py-4 text-[10px] font-black uppercase ${adminTab === tab ? 'text-gold border-b-2 border-gold' : 'text-gray-600'}`}>{tab}</button>
            ))}
          </div>

          <div className="flex-grow overflow-y-auto p-4 space-y-4">
            {adminTab === 'stats' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#111] p-4 rounded-2xl">Total Users: {allUsers.length}</div>
                  <div className="bg-[#111] p-4 rounded-2xl text-gold">Pool Balance: {allUsers.reduce((s, u) => s + (u.balance || 0), 0).toFixed(4)}</div>
                </div>
                
                <div className="bg-[#111] p-6 rounded-2xl space-y-4 border border-gold/10">
                  <h4 className="text-gold text-[10px] font-black uppercase tracking-widest">Global Rewards & API</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[8px] text-gray-400 uppercase">Mine Reward</label>
                      <input id="adm_mine" defaultValue={config.rewards.mine} step="0.00001" type="number" className="w-full bg-black border p-3 rounded-xl text-xs" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] text-gray-400 uppercase">Faucet Reward</label>
                      <input id="adm_faucet" defaultValue={config.rewards.faucet} step="0.00001" type="number" className="w-full bg-black border p-3 rounded-xl text-xs" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] text-gray-400 uppercase">Daily Bonus</label>
                      <input id="adm_daily" defaultValue={config.rewards.daily} step="0.00001" type="number" className="w-full bg-black border p-3 rounded-xl text-xs" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] text-gray-400 uppercase">Ref Bonus</label>
                      <input id="adm_ref_bonus" defaultValue={config.limits.ref_bonus} step="0.0001" type="number" className="w-full bg-black border p-3 rounded-xl text-xs" />
                    </div>
                  </div>
                  
                  <div className="space-y-1 pt-2">
                    <label className="text-[8px] text-gold uppercase font-black">FaucetPay API Key</label>
                    <input id="adm_api_key" defaultValue={config.api_key} type="text" className="w-full bg-black border border-gold/30 p-3 rounded-xl text-xs text-gold" placeholder="fpay_api_..." />
                  </div>

                  <button className="bg-gold text-black w-full py-4 rounded-2xl font-black text-xs uppercase shadow-lg shadow-gold/20" onClick={() => {
                    const newConfig = { ...config };
                    newConfig.rewards.mine = parseFloat((document.getElementById('adm_mine') as HTMLInputElement).value);
                    newConfig.rewards.faucet = parseFloat((document.getElementById('adm_faucet') as HTMLInputElement).value);
                    newConfig.rewards.daily = parseFloat((document.getElementById('adm_daily') as HTMLInputElement).value);
                    newConfig.limits.ref_bonus = parseFloat((document.getElementById('adm_ref_bonus') as HTMLInputElement).value);
                    newConfig.api_key = (document.getElementById('adm_api_key') as HTMLInputElement).value;
                    db.ref('app_config').set(newConfig);
                    getTele()?.showAlert("System Config Synchronized!");
                  }}>SAVE CHANGES</button>
                </div>
              </div>
            )}
            
            {adminTab === 'withdrawals' && (
              <div className="space-y-3">
                <h3 className="text-gold text-xs font-black uppercase px-2">Payout Queue</h3>
                {allWithdrawals.map(w => (
                  <div key={w.id} className="bg-[#111] p-4 rounded-2xl flex justify-between border border-white/5">
                    <div>
                      <div className="text-white font-bold">{w.email}</div>
                      <div className="text-gold text-[10px] font-black">{w.amount} TON</div>
                      <div className={`text-[8px] font-bold ${w.status === 'PAID' ? 'text-green-500' : 'text-yellow-500'}`}>{w.status}</div>
                    </div>
                    {w.status === 'PENDING' && (
                      <div className="flex gap-2">
                        <button onClick={() => updateWithdrawalStatus(w.id, 'PAID', w.uid, w.amount)} className="bg-green-600/20 text-green-500 p-2 rounded-lg text-[10px] font-black">Approve</button>
                        <button onClick={() => updateWithdrawalStatus(w.id, 'REJECTED', w.uid, w.amount)} className="bg-red-600/20 text-red-500 p-2 rounded-lg text-[10px] font-black">Reject</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            
            {adminTab === 'users' && (
              <div className="space-y-2">
                {allUsers.map(u => (
                  <div key={u.uid} className="bg-[#111] p-3 rounded-xl flex justify-between text-xs border border-white/5">
                    <span className="opacity-50">{u.uid}</span>
                    <span onClick={() => updateSystemBalance(u.uid)} className="text-gold font-black cursor-pointer">{u.balance?.toFixed(5)}</span>
                  </div>
                ))}
              </div>
            )}
            
            {adminTab === 'broadcast' && (
              <div className="space-y-4">
                <textarea value={broadcastMsg} onChange={(e) => setBroadcastMsg(e.target.value)} className="w-full h-40 bg-[#111] p-4 rounded-2xl text-xs outline-none focus:border-gold border border-white/5" placeholder="Enter broadcast message..."></textarea>
                <button className="bg-gold text-black w-full py-4 rounded-2xl font-black text-xs" onClick={sendBroadcast}>SEND BROADCAST</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
