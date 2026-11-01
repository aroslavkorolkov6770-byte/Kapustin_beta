"use client";
import React from 'react';
import VatesLogo from '@/app/components/VatesLogo';

export default function Footer() {
  return (
    <>
      <footer style={footerStyle as any} className="vates-footer">
         <VatesLogo className="vates-footer-logo" />
         <div className="vates-footer-docs">
             <a href="/privacy?doc=privacy#privacy" className="doc-link" style={docLinkStyle}>Политика конфиденциальности</a>
             <a href="/privacy?doc=cookies#cookies" className="doc-link" style={docLinkStyle}>Соглашение с файлами cookie</a>
         </div>

         {/* --- БЛОК СЛУЖБЫ ПОДДЕРЖКИ --- */}
         <div className="vates-footer-support">
             <span className="vates-footer-support-label">Служба технической поддержки:</span>
             <a className="vates-footer-support-email" href="mailto:teacoffee@yandex.ru">
                 teacoffee@yandex.ru
             </a>
         </div>

         {/* СТРОГИЙ КОПИРАЙТ ПО ГОСТ Р 7.0.1—2003 */}
         <p className="vates-footer-company">ООО "Чайная Артель"</p>
         <p className="vates-footer-copyright">© Корольков Я.Д., 2026 · Ватэс</p>
      </footer>

      <style jsx global>{`
        .doc-link { transition: 0.2s; color: var(--app-text-muted); text-decoration: none; }
        .doc-link:hover { color: var(--app-accent) !important; }
      `}</style>
    </>
  );
}

// --- СТИЛИ КОМПОНЕНТА ---
const footerStyle = { 
  width: '100%', 
  textAlign: 'center', 
  padding: '60px 20px', 
  display: 'flex', 
  flexDirection: 'column', 
  alignItems: 'center',
  marginTop: 'auto',
  zIndex: 10
};

const docLinkStyle = { fontSize: '13px', padding: '5px 10px', fontWeight: '600', outline: 'none' };
