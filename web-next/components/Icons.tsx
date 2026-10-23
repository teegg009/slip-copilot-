// ไอคอนทั้งหมดอยู่ใน sprite เดียว ใช้ผ่าน <Icon id="i-receipt" />
export function SpriteDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <symbol id="i-dash" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></symbol>
        <symbol id="i-receipt" viewBox="0 0 24 24"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></symbol>
        <symbol id="i-link" viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></symbol>
        <symbol id="i-building" viewBox="0 0 24 24"><path d="M4 21V5l8-2v18M12 9h8v12M4 21h16M7 8h2M7 12h2M7 16h2M15 13h2M15 17h2" /></symbol>
        <symbol id="i-userplus" viewBox="0 0 24 24"><circle cx="10" cy="8" r="4" /><path d="M3 21c0-4 3-6 7-6M18 8v6M15 11h6" /></symbol>
        <symbol id="i-download" viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M4 20h16" /></symbol>
        <symbol id="i-logout" viewBox="0 0 24 24"><path d="M9 4H5v16h4M16 8l4 4-4 4M20 12H9" /></symbol>
        <symbol id="i-mail" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></symbol>
        <symbol id="i-menu" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16" /></symbol>
        <symbol id="i-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></symbol>
        <symbol id="i-edit" viewBox="0 0 24 24"><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3zM13.5 7.5l3 3" /></symbol>
        <symbol id="i-trash" viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></symbol>
        <symbol id="i-moon" viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" /></symbol>
        <symbol id="i-wallet" viewBox="0 0 24 24"><path d="M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7zM3 7l12-4v4M16 14h2" /></symbol>
        <symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></symbol>
        <symbol id="i-stack" viewBox="0 0 24 24"><path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5" /></symbol>
        <symbol id="c-food" viewBox="0 0 24 24"><path d="M7 3v7a2 2 0 0 0 4 0V3M9 3v18M17 3c-2 2-3 4-3 7h3v11" /></symbol>
        <symbol id="c-transport" viewBox="0 0 24 24"><path d="M5 16l1.6-5.2A2 2 0 0 1 8.5 9.4h7a2 2 0 0 1 1.9 1.4L19 16M4 16h16v3H4zM7 19v2M17 19v2M7.5 13h.01M16.5 13h.01" /></symbol>
        <symbol id="c-shopping" viewBox="0 0 24 24"><path d="M6 8h12l1 12H5L6 8zM9 8a3 3 0 0 1 6 0" /></symbol>
        <symbol id="c-utilities" viewBox="0 0 24 24"><path d="M13 2L5 14h6l-1 8 8-12h-6l1-8z" /></symbol>
        <symbol id="c-health" viewBox="0 0 24 24"><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 5.5-7 10-7 10z" /></symbol>
        <symbol id="c-other" viewBox="0 0 24 24"><path d="M3 12l9-9h8v8l-9 9-8-8zM15.5 7.5h.01" /></symbol>
      </defs>
    </svg>
  );
}

export function Icon({ id }: { id: string }) {
  return (
    <svg className="i"><use href={`#${id}`} /></svg>
  );
}
