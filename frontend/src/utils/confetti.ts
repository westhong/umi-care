// Confetti animation — ported from UmiCare v4.x
export function confetti() {
  const colors = ['#667eea', '#f4a261', '#f093fb', '#4ade80', '#fb923c', '#ff85a1', '#c8a8e9'];
  for (let i = 0; i < 20; i++) {
    setTimeout(() => {
      const el = document.createElement('div');
      el.className = 'confetti-piece';
      el.style.cssText = `
        left: ${Math.random() * 100}vw;
        top: -10px;
        background: ${colors[Math.floor(Math.random() * colors.length)]};
        animation-duration: ${1 + Math.random()}s;
        animation-delay: ${Math.random() * 0.3}s;
      `;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 2000);
    }, i * 40);
  }
}
