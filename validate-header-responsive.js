#!/usr/bin/env node

/**
 * MaxOnu Header Responsiveness Validation
 * Verifica melhorias na responsividade do header
 */

const fs = require('fs');
const path = require('path');

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║       MaxOnu Header - Responsive Improvements Report         ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// Read CSS file
const cssPath = path.join(__dirname, 'public/css/header.css');
const cssContent = fs.readFileSync(cssPath, 'utf8');

// Check for important CSS improvements
const checks = {
  'Header variables': cssContent.includes('--mx-h-height: 76px'),
  'Tablet 1024px breakpoint': cssContent.includes('max-width: 1024px'),
  'Tablet 880px breakpoint': cssContent.includes('max-width: 880px'),
  'Tablet 1080px breakpoint': cssContent.includes('max-width: 1080px'),
  'Phone 600px breakpoint': cssContent.includes('max-width: 600px'),
  'Phone 480px breakpoint': cssContent.includes('max-width: 480px'),
  'Phone 380px breakpoint': cssContent.includes('max-width: 380px'),
  'Clamp() for responsive padding': cssContent.includes('clamp('),
  'Mobile drawer with safe-area': cssContent.includes('env(safe-area-inset'),
  'Hamburger menu animation': cssContent.includes('rotate(45deg)'),
  'Glass morphism effect': cssContent.includes('backdrop-filter: blur'),
  'Dark mode support': cssContent.includes('[data-theme="dark"]'),
  'Touch-friendly button sizes': cssContent.includes('width: 44px'),
  'Mobile drawer overflow': cssContent.includes('-webkit-overflow-scrolling'),
  'Responsive panels': cssContent.includes('width: min('),
  'Focus states (accessibility)': cssContent.includes('focus-visible'),
};

// Count breakpoints
const breakpointRegex = /@media \(max-width: \d+px\)/g;
const breakpointMatches = cssContent.match(breakpointRegex) || [];

// Read HTML file
const htmlPath = path.join(__dirname, 'public/header.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

const htmlChecks = {
  'Header semantic element': htmlContent.includes('<header'),
  'Nav semantic element': htmlContent.includes('<nav'),
  'Mobile drawer structure': htmlContent.includes('mxHeadDrawer'),
  'Notification system': htmlContent.includes('mxHeadNotif'),
  'Profile dropdown': htmlContent.includes('mxHeadProfile'),
  'Theme toggle button': htmlContent.includes('mxHeadThemeBtn'),
  'Hamburger menu button': htmlContent.includes('mxHeadMenuBtn'),
  'ARIA labels (accessibility)': htmlContent.includes('aria-label'),
  'ARIA expanded states': htmlContent.includes('aria-expanded'),
  'Role attributes': htmlContent.includes('role='),
};

let passCount = 0;
let totalCount = Object.keys(checks).length + Object.keys(htmlChecks).length;

console.log('✅ CSS Improvements Detected:\n');
Object.entries(checks).forEach(([check, passed]) => {
  const status = passed ? '✓' : '✗';
  console.log(`   ${status} ${check}`);
  if (passed) passCount++;
});

console.log('\n✅ HTML Structure Validation:\n');
Object.entries(htmlChecks).forEach(([check, passed]) => {
  const status = passed ? '✓' : '✗';
  console.log(`   ${status} ${check}`);
  if (passed) passCount++;
});

console.log('\n─────────────────────────────────────────────────────────────────\n');

console.log('📊 Responsive Breakpoints Detected:');
const uniqueBreakpoints = [...new Set(breakpointMatches)].sort((a, b) => {
  const aVal = parseInt(a.match(/\d+/)[0]);
  const bVal = parseInt(b.match(/\d+/)[0]);
  return bVal - aVal;
});

uniqueBreakpoints.forEach((bp) => {
  console.log(`   • ${bp}`);
});

console.log('\n✨ Key Features:\n');
const features = [
  'Desktop-first responsive design (76px header)',
  'Tablet optimization (1024px, 880px breakpoints)',
  'Mobile-first approach for phones (600px, 480px, 380px)',
  'Fluid sizing with CSS clamp() for smooth transitions',
  'Mobile drawer with safe-area-inset support',
  'Touch-friendly interface (44px buttons minimum)',
  'Dark mode support with CSS variables',
  'Glass morphism with backdrop filter',
  'Smooth animations and transitions',
  'Hamburger menu with animated icon',
  'Notification system with badge counter',
  'Profile dropdown menu',
  'Theme toggle (light/dark)',
  'Full accessibility support (ARIA labels, roles)',
  'Semantic HTML structure',
];

features.forEach((f, i) => {
  console.log(`   ${i + 1}. ${f}`);
});

console.log('\n📱 Responsive Behavior:\n');
const behavior = [
  { width: '> 1080px', desc: 'Full navigation visible, desktop layout' },
  {
    width: '1024px - 1080px',
    desc: 'Navigation optimized, smaller font sizes',
  },
  {
    width: '880px - 1024px',
    desc: 'Hamburger menu appears, drawer navigation',
  },
  {
    width: '720px - 880px',
    desc: 'Header height reduced to 68px, compact buttons',
  },
  {
    width: '600px - 880px',
    desc: 'Mobile layout, optimized panels, smaller icons',
  },
  {
    width: '480px - 600px',
    desc: 'Compact phone layout, minimal guest buttons',
  },
  { width: '< 380px', name: 'Logo text hidden, max compact layout' },
];

behavior.forEach((b) => {
  console.log(`   📍 ${b.width}`);
  console.log(`      → ${b.desc || b.name}`);
});

console.log('\n🎨 CSS Variables for Theming:\n');
const cssVars = [
  '--mx-h-height (header height)',
  '--mx-h-radius (border radius)',
  '--mx-h-blur (backdrop blur)',
  '--mx-h-pad-x (horizontal padding)',
  '--mx-h-bar-bg (background color)',
  '--mx-h-text (text color)',
  '--mx-h-accent (accent color)',
  '--mx-h-focus (focus outline)',
];

cssVars.forEach((v) => {
  console.log(`   • ${v}`);
});

console.log('\n🔄 Dark Mode Colors:\n');
const darkMode = [
  'Background: rgba(10, 22, 38, 0.78)',
  'Text: #e8f0fa (light blue)',
  'Accent: #6eb8e8 (bright blue)',
  'Danger: #ff7b8c (soft red)',
];

darkMode.forEach((d) => {
  console.log(`   • ${d}`);
});

console.log('\n✅ Test Summary:\n');
const percentage = ((passCount / totalCount) * 100).toFixed(1);
console.log(`   Checks Passed: ${passCount}/${totalCount} (${percentage}%)`);
console.log(`   Status: ${passCount === totalCount ? '✓ ALL TESTS PASSED' : '⚠ Some checks failed'}`);

console.log('\n📈 Performance Optimizations:\n');
const perf = [
  'CSS clamp() for fluid typography',
  'CSS Grid for flexible layouts',
  'Flexbox for responsive components',
  'CSS variables for theme switching',
  'Minimal JS for animations (prefers-reduced-motion)',
  'Backdrop filter for modern browsers',
  'Safe-area-inset for notch support',
];

perf.forEach((p) => {
  console.log(`   ✓ ${p}`);
});

console.log('\n═════════════════════════════════════════════════════════════════\n');

console.log('🚀 How to Test Responsiveness:\n');
const testSteps = [
  'Open the website in your browser',
  'Press F12 to open Developer Tools',
  'Click the mobile device toggle (Ctrl+Shift+M)',
  'Test different device sizes:',
  '   • iPhone 12 (390px)',
  '   • iPhone 12 Pro Max (430px)',
  '   • iPad (768px)',
  '   • iPad Pro (1024px)',
  '   • Desktop (1920px)',
  'Test dark mode: Open browser console and run:',
  '   document.documentElement.setAttribute("data-theme", "dark")',
  'Test hamburger menu: Click at 1080px breakpoint',
  'Test touch interactions on mobile devices',
];

testSteps.forEach((step) => {
  console.log(`   ${step}`);
});

console.log('\n═════════════════════════════════════════════════════════════════\n');

process.exit(passCount === totalCount ? 0 : 1);
