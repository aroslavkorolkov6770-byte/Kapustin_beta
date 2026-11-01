"use client";
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import CustomIcon from '@/app/components/CustomIcon';
import ThemeToggle from '@/app/components/ThemeToggle';
import VatesLogo from '@/app/components/VatesLogo';
import { applyClientAuthState, getClientLandingPath, type ClientSessionUser } from '@/app/lib/authClient';

const LOGIN_VIEWPORT_CLASS = 'vates-login-viewport';


export default function LoginPage() {
  const router = useRouter();
  const [isMounted, setIsMounted] = useState(false);

  // Состояния режимов и инпутов
  
  const [login, setLogin] = useState("");
  const [pass, setPass] = useState("");
  
  
  
  
  

  // НОВОЕ: Состояние для галочки согласия
  

  // Состояния уведомлений
  const [errorMessage, setErrorMessage] = useState("");
  

  // Состояния Vates Guard
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [isCaptchaVerified, setIsCaptchaVerified] = useState(false);
  const [isCaptchaLoading, setIsCaptchaLoading] = useState(false);

  useEffect(() => {
    setIsMounted(true);

    const syncSession = async () => {
        try {
            const response = await fetch('/api/auth/session', { cache: 'no-store' });

            if (!response.ok) {
                return;
            }

            const sessionData = await response.json();
            const sessionUser = sessionData?.user;

            if (!sessionData?.authenticated || !sessionUser) {
                return;
            }

            const normalizedUser = {
                id: sessionUser.id,
                login: sessionUser.login,
                role: sessionUser.role,
                name: sessionUser.name || (sessionUser.role === 'admin' ? 'Главный Мастер' : 'Сотрудник'),
                systemAccount: Boolean(sessionUser.systemAccount),
                ghostAccount: Boolean(sessionUser.ghostAccount),
                profileDisabled: Boolean(sessionUser.profileDisabled),
                profileOwnerOnly: Boolean(sessionUser.profileOwnerOnly),
                hideFromStats: Boolean(sessionUser.hideFromStats),
                canSwitchMode: Boolean(sessionUser.canSwitchMode),
                accountLabel: sessionUser.accountLabel || '',
            } satisfies ClientSessionUser;
            applyClientAuthState(normalizedUser);
            router.push(getClientLandingPath(normalizedUser));
        } catch (error) {
            console.error('Ошибка проверки активной сессии:', error);
        }
    };

    syncSession();
  }, [router]);

  useEffect(() => {
    const viewportElements = [document.documentElement, document.body];
    viewportElements.forEach(element => element.classList.add(LOGIN_VIEWPORT_CLASS));
    return () => viewportElements.forEach(element => element.classList.remove(LOGIN_VIEWPORT_CLASS));
  }, []);

  const handleCaptchaClick = () => {
      if (isCaptchaVerified || isCaptchaLoading) return;
      setIsCaptchaLoading(true);
      setTimeout(() => {
          setIsCaptchaLoading(false);
          setIsCaptchaVerified(true);
          setErrorMessage(""); 
      }, 1200);
  };

  const processAuth = (user: any, nameToSave: string) => {
      const normalizedUser = {
          id: user.id,
          login: user.login,
          role: user.role,
          name: nameToSave,
          systemAccount: Boolean(user.systemAccount),
          ghostAccount: Boolean(user.ghostAccount),
          profileDisabled: Boolean(user.profileDisabled),
          profileOwnerOnly: Boolean(user.profileOwnerOnly),
          hideFromStats: Boolean(user.hideFromStats),
          canSwitchMode: Boolean(user.canSwitchMode),
          accountLabel: user.accountLabel || '',
      } satisfies ClientSessionUser;
      applyClientAuthState(normalizedUser);
      router.push(getClientLandingPath(normalizedUser));
  };

  const handleLogin = async () => {
    if (failedAttempts >= 3 && !isCaptchaVerified) {
        setErrorMessage("Пожалуйста, подтвердите, что вы человек.");
        return;
    }

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ login, password: pass }),
        });

        const result = await response.json().catch(() => ({}));

        

        if (!response.ok || !result?.user) {
            const newFails = failedAttempts + 1;
            setFailedAttempts(newFails);
            if (isCaptchaVerified) setIsCaptchaVerified(false);
            setErrorMessage(result?.error || "Неправильно введен логин или пароль!");
            return;
        }

        setFailedAttempts(0);
        setIsCaptchaVerified(false);
        processAuth(result.user, result.user.name);
    } catch (error) {
        console.error("Ошибка связи с сервером:", error);
        setErrorMessage("Не удалось подключиться к базе данных.");
    }
  };

  

  if (!isMounted) return null;

  return (
    <div className={`login-page ${'login-page--login-mode'}`} style={{ minHeight: '0', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box', overflowX: 'hidden', maxWidth: '100vw' }}>
      
      <div className="login-background-photo" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundImage: 'url("https://u.9111s.ru/uploads/202402/17/a0254a12ef37da5aaf5c5646a30baab8.webp")', backgroundSize: 'cover', backgroundPosition: 'center', zIndex: -2, backgroundColor: '#000' }} />
      <div className="login-background-shade" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)', zIndex: -1 }} />

      <section className="vates-auth-story">
          <div className="vates-auth-story-top">
              <VatesLogo className="vates-auth-logo" priority />
          </div>
          <div className="vates-auth-message">
              <h1>Обучение команды — под вашим контролем.</h1>
              <p>Отслеживайте прохождение, ответы и пробелы в знаниях, чтобы вовремя подключать наставника и принимать решения на фактах.</p>
          </div>
      </section>

      <Link href="/" className="hover-link-auth" style={{ position: 'absolute', top: '30px', left: '40px', color: '#0abab5', textDecoration: 'none', fontWeight: '900', fontSize: '14px', letterSpacing: '1px' }}>
          ← НА ГЛАВНУЮ
      </Link>

      <div className="login-theme-toggle">
          <ThemeToggle />
      </div>

      <div className="login-box" style={{ background: '#0a0a0a', padding: '50px 40px', borderRadius: '35px', width: '100%', maxWidth: '390px', border: '1px solid #222', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.8)', animation: 'scaleIn 0.4s ease', boxSizing: 'border-box' }}>
        
        <div className="login-card-heading">
            <span className="login-card-eyebrow">
                {'Личный кабинет'}
            </span>
            <h1>{'Вход в Ватэс'}</h1>
            <p>
                {'Введите данные, чтобы продолжить обучение.'}
            </p>
        </div>

        
        
        
        
        <input className="login-input" type="text" placeholder="Логин" value={login} onChange={(e)=>setLogin(e.target.value)} style={inputS} />
        <input className="login-input" type="password" placeholder="Пароль" value={pass} onChange={(e)=>setPass(e.target.value)} style={inputS} onKeyDown={(e) => { if(e.key === 'Enter') { handleLogin() } }} />
        
        

        {failedAttempts >= 3 && (
            <div style={{ display: 'flex', justifyContent: 'center', width: '100%', marginBottom: '20px', marginTop: '10px' }}>
                <div className="tea-guard" style={teaGuardContainerStyle as any}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div className="tea-guard-checkbox" onClick={handleCaptchaClick} style={teaGuardCheckboxStyle(isCaptchaVerified) as any}>
                            {isCaptchaLoading && <div className="captcha-spinner"></div>}
                            {isCaptchaVerified && <span style={{ color: '#0abab5', display: 'inline-flex' }}><CustomIcon name="check" size={24} color="#0abab5" /></span>}
                        </div>
                        <span className="tea-guard-label" style={{ color: '#fff', fontSize: '15px', fontWeight: '500' }}>Я человек</span>
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="#0abab5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            <rect x="9" y="11" width="6" height="5" rx="1" stroke="#0abab5" strokeWidth="1.5"/>
                            <path d="M10 11V9a2 2 0 014 0v2" stroke="#0abab5" strokeWidth="1.5" strokeLinecap="round"/>
                            <circle cx="12" cy="13.5" r="1" fill="#0abab5"/>
                        </svg>
                        <div className="tea-guard-brand" style={{ color: '#fff', fontSize: '11px', fontWeight: '900', marginTop: '4px', letterSpacing: '0.5px' }}>Vates Guard</div>
                        <div className="tea-guard-subtitle" style={{ color: '#666', fontSize: '9px', marginTop: '2px' }}>Ватэс</div>
                    </div>
                </div>
            </div>
        )}
        
        {(
            <button className="hover-unified-auth" onClick={handleLogin} style={modalLoginBtn as any}>ВОЙТИ</button>
        )}
        
        
      </div>

      {/* --- МОДАЛЬНОЕ ОКНО ОШИБКИ --- */}
      {errorMessage && (
          <div className="login-error-backdrop" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 40000 }} onClick={() => setErrorMessage("")}>
              <div className="login-error-modal" style={{ background: '#111', padding: '40px 30px', borderRadius: '30px', width: '90%', maxWidth: '380px', border: '1px solid #333', textAlign: 'center', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)', animation: 'scaleIn 0.2s ease' }} onClick={e => e.stopPropagation()}>
                  <div style={warningBadgeStyle as any}><CustomIcon name="alert" size={34} color="#ff4d4d" /></div>
                  <h2 style={{ color: '#ff4d4d', fontSize: '20px', fontWeight: '900', marginBottom: '15px', textTransform: 'uppercase' }}>Ошибка</h2>
                  <p style={{ color: '#ccc', fontSize: '14px', lineHeight: '1.5', marginBottom: '25px' }}>{errorMessage}</p>
                  <div className="login-error-dismiss hover-unified-auth" onClick={() => setErrorMessage("")} style={{ width: '100%', padding: '14px', background: '#333', color: '#fff', borderRadius: '14px', fontWeight: '900', cursor: 'pointer', fontSize: '14px', textTransform: 'uppercase', transition: '0.2s' }}>ПОНЯТНО</div>
              </div>
          </div>
      )}

      <style jsx global>{`
        html, body {
          margin: 0;
          padding: 0;
          width: 100%;
          overflow-x: hidden !important;
        }
        @keyframes scaleIn { 
          from { transform: scale(0.9); opacity: 0; } 
          to { transform: scale(1); opacity: 1; } 
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes captchaSpin {
          100% { transform: rotate(360deg); }
        }
        .captcha-spinner {
          width: 18px; height: 18px; border: 3px solid #333;
          border-top-color: #0abab5; border-radius: 50%;
          animation: captchaSpin 1s linear infinite;
        }

        .hover-unified-auth {
          transition: transform 0.16s ease, box-shadow 0.16s ease, background 0.16s ease, border-color 0.16s ease, color 0.16s ease;
        }

        .hover-unified-auth:hover {
          transform: translateY(1px) scale(0.985);
          border-color: rgba(10, 186, 181, 0.45) !important;
          background: rgba(10, 186, 181, 0.14) !important;
          color: #fff !important;
          box-shadow: inset 0 2px 6px rgba(0,0,0,0.18), 0 0 0 1px rgba(10,186,181,0.24);
        }

        .hover-unified-auth:active {
          transform: translateY(2px) scale(0.97);
          box-shadow: inset 0 3px 8px rgba(0,0,0,0.24);
        }

        .hover-link-auth {
          transition: transform 0.16s ease, color 0.16s ease, text-shadow 0.16s ease;
        }

        .hover-link-auth:hover {
          transform: translateY(1px) scale(0.985);
          color: #fff !important;
          text-shadow: 0 0 10px rgba(10, 186, 181, 0.18);
        }

        @media (max-width: 768px) {
            .login-box {
                padding: 35px 20px !important;
                max-width: 100% !important;
            }
        }
      `}</style>
    </div>
  );
}

// --- СТИЛИ ИНПУТОВ И КНОПОК ---
const inputS = { 
    width: '100%', 
    padding: '16px 20px', 
    marginBottom: '15px', 
    borderRadius: '16px', 
    background: '#111', 
    border: '1px solid #333', 
    color: '#fff', 
    outline: 'none', 
    fontSize: '16px', // ИСПРАВЛЕНО: 16px предотвращает зум на iOS
    boxSizing: 'border-box' as any,
    transition: '0.2s ease'
};

const modalLoginBtn = { 
    width: '100%', 
    padding: '16px', 
    background: '#0ABAB5', 
    color: '#000', 
    textAlign: 'center', 
    borderRadius: '16px', 
    fontWeight: '900', 
    cursor: 'pointer', 
    fontSize: '15px', 
    textTransform: 'uppercase', 
    marginTop: '10px', 
    border: 'none',
    boxSizing: 'border-box' as any,
    transition: '0.2s ease'
};

const teaGuardContainerStyle = {
    background: '#161816',
    border: '1px solid #333',
    borderRadius: '16px',
    width: '100%',
    height: '78px',
    display: 'flex',
    alignItems: 'center',
    padding: '0 20px',
    justifyContent: 'space-between',
    boxShadow: '0px 4px 10px rgba(0,0,0,0.3)',
    boxSizing: 'border-box'
};

const teaGuardCheckboxStyle = (isVerified: boolean) => ({
    width: '32px',
    height: '32px',
    background: isVerified ? 'transparent' : '#000',
    border: isVerified ? '2px solid #0abab5' : '2px solid #444',
    borderRadius: '6px',
    cursor: isVerified ? 'default' : 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: '0.2s ease',
    boxShadow: isVerified ? '0 0 10px rgba(10,186,181,0.2)' : 'none'
});

const warningBadgeStyle = {
    width: '60px',
    height: '60px',
    borderRadius: '18px',
    border: '1px solid rgba(255,77,77,0.35)',
    background: 'rgba(255,77,77,0.08)',
    color: '#ff4d4d',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '32px',
    fontWeight: '900',
    margin: '0 auto 15px auto'
};
