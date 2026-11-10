const state = {
  loggedIn: false,
  wallet: 0,
  user: null,
  session: null,
  modal: null,
  drawerOpen: false,
  selectedService: null,
  catalogueReady: true,
  txCount: 3,
  lastReceipt: null
};

const runtimeConfig = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
  flutterwavePublicKey: import.meta.env.VITE_FLUTTERWAVE_PUBLIC_KEY || '',
  appUrl: import.meta.env.VITE_APP_URL || '',
  supportWhatsappUrl: import.meta.env.VITE_SUPPORT_WHATSAPP_URL || ''
};
const supabaseClient = runtimeConfig.supabaseUrl && runtimeConfig.supabaseAnonKey && window.supabase
  ? window.supabase.createClient(runtimeConfig.supabaseUrl, runtimeConfig.supabaseAnonKey)
  : null;

function randomRefPart() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();
}

async function refreshWallet() {
  if (!supabaseClient || !state.user) return;
  const { data, error } = await supabaseClient.from('wallets').select('balance').eq('user_id', state.user.id).single();
  if (!error && data) {
    state.wallet = Number(data.balance || 0);
    updateProfile();
  }
}

async function syncSession() {
  if (!supabaseClient) return;
  const { data } = await supabaseClient.auth.getSession();
  state.session = data.session;
  state.user = data.session?.user || null;
  state.loggedIn = Boolean(state.user);
  updateProfile();
  await refreshWallet();
  await retryPendingGuestPurchase();
}

async function invokeFunction(name, body) {
  if (!supabaseClient) throw new Error('Supabase frontend variables are not configured');
  const { data, error } = await supabaseClient.functions.invoke(name, { body });
  if (error) throw error;
  return data;
}

function walletFundingRef() {
  if (!state.user?.id) throw new Error('You must be logged in to fund a wallet');
  return `FUND_${state.user.id}_${randomRefPart()}`;
}

function guestPaymentRef() {
  return `PUD_${new Date().getFullYear()}_${randomRefPart()}`;
}

function launchFlutterwave({ amount, txRef, email, onSuccess }) {
  if (!window.FlutterwaveCheckout || !runtimeConfig.flutterwavePublicKey) {
    showToast('Flutterwave is not configured yet. Add the public key in Manus project variables.');
    return;
  }
  window.FlutterwaveCheckout({
    public_key: runtimeConfig.flutterwavePublicKey,
    tx_ref: txRef,
    amount,
    currency: 'NGN',
    payment_options: 'card,banktransfer,ussd',
    customer: { email },
    customizations: { title: 'pudata', description: 'Everyday payments, made clear' },
    callback: onSuccess,
    onclose: () => showToast('Checkout closed. You can retry with the same transaction reference.')
  });
}

const services = [
  { id: 'airtime', title: 'Buy Airtime', subtitle: 'MTN · Airtel · Glo · 9mobile', tone: 'butter', art: 'airtime', active: true, kind: 'airtime' },
  { id: 'data', title: 'Buy Data', subtitle: 'Plans from ₦100', tone: 'mint', art: 'data', active: true, kind: 'data' },
  { id: 'tv', title: 'Pay TV Subscription', subtitle: 'DSTV · GOtv', tone: 'lavender', art: 'tv', active: true, kind: 'tv' },
  { id: 'electricity', title: 'Pay Electricity Bills', subtitle: 'Coming soon', tone: 'peach', art: 'electricity', active: false, kind: 'electricity' },
  { id: 'education', title: 'Education Payments', subtitle: 'WAEC · NECO pins', tone: 'sky', art: 'education', active: true, kind: 'education' },
  { id: 'pins', title: 'Data / Recharge Pins', subtitle: 'Instant delivery', tone: 'lemon', art: 'pins', active: true, kind: 'pins' },
  { id: 'transactions', title: 'Transactions', subtitle: 'Receipts and status', tone: 'paper', art: 'transactions', active: true, kind: 'transactions' },
  { id: 'referrals', title: 'Referral & Rewards', subtitle: 'Share the good stuff', tone: 'mint', art: 'referrals', active: true, kind: 'referrals' },
  { id: 'all', title: 'All Services', subtitle: 'See the full catalogue', tone: 'lavender', art: 'all', active: true, kind: 'all' }
];

const svg = {
  airtime: '<svg viewBox="0 0 100 80" aria-hidden="true"><rect x="23" y="10" width="49" height="63" rx="10" fill="#ff4d5a" transform="rotate(-8 23 10)"/><rect x="30" y="19" width="35" height="45" rx="5" fill="#ff6b6b" transform="rotate(-8 30 19)"/><circle cx="48" cy="56" r="4" fill="#ff4d5a"/><path d="M39 29c5-5 13-6 19-2M40 36c3-3 8-4 12-2" fill="none" stroke="#ff4d5a" stroke-width="3" stroke-linecap="round"/></svg>',
  data: '<svg viewBox="0 0 100 80" aria-hidden="true"><path d="M42 10c20 0 37 16 37 36S62 72 42 72 5 56 5 36 22 10 42 10Z" fill="#fff" opacity=".75"/><path d="M46 14 30 43h14l-5 23 19-31H44Z" fill="#ff4d5a"/><circle cx="78" cy="17" r="7" fill="#ff6b6b"/><circle cx="83" cy="67" r="4" fill="#ff4d5a" opacity=".25"/></svg>',
  tv: '<svg viewBox="0 0 100 80" aria-hidden="true"><rect x="13" y="20" width="66" height="44" rx="8" fill="#ff4d5a"/><rect x="19" y="26" width="54" height="31" rx="4" fill="#fff1f2"/><path d="m25 50 12-11 8 7 10-14 11 18Z" fill="#ff6b6b"/><path d="M37 68h19M47 64v4" stroke="#ff4d5a" stroke-width="4" stroke-linecap="round"/><circle cx="82" cy="29" r="9" fill="#ff6b6b"/><path d="M79 29h6M82 26v6" stroke="#ff4d5a" stroke-width="2" stroke-linecap="round"/></svg>',
  electricity: '<svg viewBox="0 0 100 80" aria-hidden="true"><path d="M43 8h22L53 32h17L40 73l7-29H30Z" fill="#ff4d5a"/><circle cx="70" cy="60" r="12" fill="#fff" opacity=".76"/><path d="M70 52v16M62 60h16" stroke="#ff4d5a" stroke-width="3" stroke-linecap="round"/></svg>',
  education: '<svg viewBox="0 0 100 80" aria-hidden="true"><path d="m11 27 38-15 40 15-40 16Z" fill="#ff4d5a"/><path d="M22 32v19c11 9 41 9 54 0V32L49 43Z" fill="#fff" opacity=".8"/><path d="M86 27v27" stroke="#ff4d5a" stroke-width="4" stroke-linecap="round"/><circle cx="86" cy="57" r="4" fill="#ff6b6b"/></svg>',
  pins: '<svg viewBox="0 0 100 80" aria-hidden="true"><rect x="15" y="22" width="56" height="39" rx="8" fill="#ff4d5a" transform="rotate(-8 15 22)"/><rect x="30" y="17" width="56" height="39" rx="8" fill="#fff" transform="rotate(8 30 17)"/><path d="M45 33h25M45 41h17" stroke="#ff4d5a" stroke-width="3" stroke-linecap="round"/><circle cx="73" cy="46" r="5" fill="#ff6b6b"/></svg>',
  transactions: '<svg viewBox="0 0 100 80" aria-hidden="true"><rect x="25" y="9" width="47" height="61" rx="8" fill="#fff" stroke="#ff4d5a" stroke-width="3"/><path d="M36 24h25M36 34h25M36 44h14" stroke="#ff4d5a" stroke-width="3" stroke-linecap="round"/><circle cx="64" cy="59" r="12" fill="#ff6b6b"/><path d="m58 59 4 4 8-9" fill="none" stroke="#ff4d5a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  referrals: '<svg viewBox="0 0 100 80" aria-hidden="true"><circle cx="38" cy="34" r="13" fill="#ff4d5a"/><circle cx="68" cy="27" r="10" fill="#ff4d5a" opacity=".8"/><circle cx="73" cy="57" r="13" fill="#ff6b6b"/><path d="M51 32 61 29M48 44l15 8" stroke="#ff4d5a" stroke-width="4" stroke-linecap="round"/><path d="m71 48 3 7 7 1-5 5 1 7-7-3-6 3 1-7-5-5 7-1Z" fill="#fff"/></svg>',
  all: '<svg viewBox="0 0 100 80" aria-hidden="true"><rect x="14" y="13" width="28" height="25" rx="7" fill="#ff4d5a"/><rect x="49" y="13" width="36" height="25" rx="7" fill="#ff6b6b"/><rect x="14" y="47" width="36" height="24" rx="7" fill="#fff" stroke="#ff4d5a" stroke-width="3"/><rect x="57" y="47" width="28" height="24" rx="7" fill="#ff4d5a" opacity=".75"/></svg>'
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
}

function renderServices() {
  const grid = $('#service-grid');
  grid.innerHTML = services.map((service) => `
    <article class="service-card ${service.active ? '' : 'is-disabled'}" data-tone="${service.tone}">
      <span class="service-status ${service.active ? 'active' : ''}">${service.active ? 'Available now' : 'Coming soon'}</span>
      <div class="service-art">${svg[service.art]}</div>
      <div class="service-content">
        <div><h3 class="service-title">${service.title}</h3><span class="service-subtitle">${service.subtitle}</span></div>
        <button class="service-cta" type="button" ${service.active ? `data-action="service" data-service="${service.kind}"` : 'disabled'} aria-label="${service.active ? `Open ${service.title}` : `${service.title} coming soon`}">${service.active ? '↗' : '·'}</button>
      </div>
    </article>
  `).join('');
}

function openDrawer() {
  state.drawerOpen = true;
  document.body.classList.add('drawer-open');
  $('.side-drawer').setAttribute('aria-hidden', 'false');
}

function closeDrawer() {
  state.drawerOpen = false;
  document.body.classList.remove('drawer-open');
  $('.side-drawer').setAttribute('aria-hidden', 'true');
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove('show'), 3200);
}

function openModal({ kicker = 'PUDATA', title, intro = '', body }) {
  $('#modal-kicker').textContent = kicker;
  $('#modal-title').textContent = title;
  $('#modal-intro').textContent = intro;
  $('#modal-body').innerHTML = body;
  $('#modal-layer').classList.add('is-open');
  $('#modal-layer').setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
}

function closeModal() {
  $('#modal-layer').classList.remove('is-open');
  $('#modal-layer').setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  state.modal = null;
}

function serviceOptions(kind) {
  if (kind === 'airtime') return '<option>MTN</option><option>Airtel</option><option>Glo</option><option>9mobile</option>';
  if (kind === 'data') return '<option>MTN</option><option>Airtel</option><option>Glo</option><option>9mobile</option>';
  if (kind === 'tv') return '<option>DSTV</option><option>GOtv</option>';
  if (kind === 'education') return '<option>WAEC result checker</option><option>NECO result checker</option>';
  return '<option>MTN data card</option><option>MTN recharge card</option><option>Airtel recharge card</option>';
}

function showPurchase(kind) {
  state.selectedService = kind;
  const titles = { airtime: 'Buy airtime', data: 'Pick a data plan', tv: 'Pay TV subscription', education: 'Get an education pin', pins: 'Get a recharge pin' };
  const copy = { airtime: 'Top up any Nigerian network. The minimum airtime amount is ₦50.', data: 'Pick a plan, enter a phone number, and we’ll keep the receipt close.', tv: 'Verify the customer before you pay. Your name will appear on the next step.', education: 'Choose a provider and quantity. We support 1–5 and 10 pins.', pins: 'Choose a product and quantity. Pins are shown on the receipt after success.' };
  const isAirtime = kind === 'airtime';
  const isTv = kind === 'tv';
  const isEducation = kind === 'education';
  const isPins = kind === 'pins';
  const networkLabel = isTv ? 'TV provider' : isEducation || isPins ? 'Product' : 'Network';
  const networkField = `<div class="field"><label for="network">${networkLabel}</label><select id="network">${serviceOptions(kind)}</select></div>`;
  let planField = '';
  if (kind === 'data') planField = '<div class="field"><label for="plan">Plan</label><select id="plan"><option>1.5GB · 30 days · ₦1,000</option><option>3GB · 30 days · ₦2,000</option><option>10GB · 30 days · ₦5,000</option></select></div>';
  if (isTv) planField = '<div class="field"><label for="plan">Subscription</label><select id="plan"><option>DSTV Compact · ₦15,700</option><option>GOtv Max · ₦8,500</option></select></div>';
  const idField = isTv ? '<div class="field"><label for="customer-id">Smart card number</label><input id="customer-id" inputmode="numeric" placeholder="e.g. 4123456789" required /></div>' : '';
  const amountField = isAirtime ? '<div class="field"><label for="amount">Amount (minimum ₦50)</label><input id="amount" type="number" min="50" step="50" value="100" required /></div>' : '';
  const qtyField = isEducation || isPins ? '<div class="field"><label for="quantity">Quantity</label><select id="quantity"><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option><option>10</option></select></div>' : '';
  const phoneField = !isTv && !isEducation && !isPins ? '<div class="field"><label for="phone">Phone number</label><input id="phone" inputmode="tel" placeholder="0800 000 0000" required /></div>' : '';
  const emailField = '<div class="field"><label for="email">Receipt email</label><input id="email" type="email" placeholder="you@example.com" required /></div>';
  const walletLine = state.loggedIn ? '<div class="modal-quiet">Pay from your wallet instantly. Guests can pay with Flutterwave card, transfer, or USSD.</div>' : '<div class="modal-quiet">Guest checkout is available. We’ll verify Flutterwave server-side before fulfilling.</div>';
  openModal({ kicker: 'SERVICE CHECKOUT', title: titles[kind], intro: copy[kind], body: `<form class="modal-form" id="purchase-form">${networkField}${planField}${idField}${phoneField}${amountField}${qtyField}${emailField}<div class="modal-actions"><button class="button button-dark" type="submit">${state.loggedIn ? 'Pay from wallet' : 'Continue to payment'} <span>↗</span></button></div>${walletLine}</form>` });
}

function showLogin() {
  openModal({ kicker: 'YOUR PUDATA ACCOUNT', title: 'Keep payments close', intro: 'Sign in to fund your wallet once, see every receipt, and get moving faster.', body: `<form class="modal-form" id="login-form"><div class="field"><label for="login-email">Email address</label><input id="login-email" type="email" placeholder="you@example.com" required /></div><div class="field"><label for="login-password">Password</label><input id="login-password" type="password" placeholder="••••••••" required /></div><div class="modal-actions"><button class="button button-dark" type="submit">Log in <span>↗</span></button></div><div class="modal-quiet">Your session is managed by Supabase Auth. Wallet balance is always read from the server.</div></form>` });
}

function showProfile() {
  if (!state.loggedIn) {
    showLogin();
    return;
  }
  openModal({ kicker: 'ACCOUNT', title: 'You’re signed in', intro: 'Your wallet and receipts are ready when you are.', body: `<div class="receipt"><div class="receipt-top"><span class="receipt-status"><span class="status-dot"></span> Active session</span><span class="receipt-ref">pudata member</span></div><div class="receipt-rows"><div class="receipt-row"><span>Wallet balance</span><strong>₦${state.wallet.toLocaleString('en-NG', { minimumFractionDigits: 2 })}</strong></div><div class="receipt-row"><span>Completed payments</span><strong>${state.txCount}</strong></div></div></div><div class="modal-actions"><button class="button button-dark" type="button" data-action="fund-wallet">Add funds <span>+</span></button><button class="text-button" type="button" data-action="logout">Log out</button></div>` });
}

function showFundWallet() {
  if (!state.loggedIn) {
    showLogin();
    showToast('Log in to fund a wallet, or continue as a guest at checkout.');
    return;
  }
  openModal({ kicker: 'WALLET', title: 'Add funds', intro: 'Fund once and pay active services from your pudata wallet.', body: `<form class="modal-form" id="fund-form"><div class="field"><label for="fund-amount">Amount</label><select id="fund-amount"><option value="1000">₦1,000</option><option value="2500">₦2,500</option><option value="5000">₦5,000</option><option value="10000">₦10,000</option></select></div><div class="option-row"><button class="option selected" type="button"><strong>Card</strong><span>Flutterwave</span></button><button class="option" type="button"><strong>Transfer</strong><span>Bank details</span></button><button class="option" type="button"><strong>USSD</strong><span>Quick code</span></button></div><div class="modal-actions"><button class="button button-dark" type="submit">Continue to payment <span>↗</span></button></div><div class="modal-quiet">After checkout, the server verifies the exact FUND_ reference, credits the wallet atomically, and the app refreshes the balance. The browser never credits it.</div></form>` });
}

function showReceipt(receipt) {
  state.lastReceipt = receipt;
  openModal({ kicker: 'PAYMENT RECEIPT', title: receipt.status === 'pending' ? 'Processing safely' : 'You’re all set', intro: receipt.status === 'pending' ? 'This payment is pending. We will not retry it with a new reference.' : 'Keep this reference if you need to check on your payment.', body: `<div class="receipt"><div class="receipt-top"><span class="receipt-status" style="color:${receipt.status === 'pending' ? '#ff4d5a' : '#ff4d5a'}"><span class="status-dot"></span> ${receipt.status === 'pending' ? 'Processing' : 'Successful'}</span><span class="receipt-ref">${receipt.reference}</span></div><div class="receipt-rows"><div class="receipt-row"><span>Service</span><strong>${escapeHtml(receipt.service)}</strong></div><div class="receipt-row"><span>Amount</span><strong>₦${Number(receipt.amount).toLocaleString('en-NG')}</strong></div><div class="receipt-row"><span>Customer</span><strong>${escapeHtml(receipt.email)}</strong></div><div class="receipt-row"><span>Fulfilment</span><strong>${receipt.status === 'pending' ? 'Awaiting confirmation' : 'PulseFlow fulfilled'}</strong></div></div>${receipt.pin ? `<div class="pins-box"><span>YOUR PIN</span><strong>${receipt.pin}</strong></div>` : ''}</div><div class="modal-actions"><button class="button button-dark" type="button" data-action="close-modal">Done <span>✓</span></button></div><div class="modal-quiet">Guest receipts can be looked up later with this reference and the email used at checkout.</div>` });
}

function showTransactions() {
  openModal({ kicker: 'TRANSACTIONS', title: 'Your payment trail', intro: state.loggedIn ? 'Every payment gets a clear status and reference.' : 'Guest payments are still traceable with a reference and email.', body: `<div class="empty-state"><strong>${state.loggedIn ? 'Recent activity' : 'Look up a guest receipt'}</strong>${state.loggedIn ? 'Your connected Supabase transaction history will appear here after sign-in.' : 'Use the reference from your receipt and the same email used at checkout.'}</div>${!state.loggedIn ? '<form class="modal-form" id="lookup-form"><div class="field"><label for="lookup-ref">Transaction reference</label><input id="lookup-ref" placeholder="PUD-2026-000123" required /></div><div class="field"><label for="lookup-email">Receipt email</label><input id="lookup-email" type="email" placeholder="you@example.com" required /></div><div class="modal-actions"><button class="button button-dark" type="submit">Find receipt <span>↗</span></button></div></form>' : ''}` });
}

function showHelp() {
  openModal({ kicker: 'HELP CENTRE', title: 'A little help, close by', intro: 'Here are the answers people usually need first.', body: '<div class="empty-state"><strong>Payment still pending?</strong>Keep your reference. Do not pay again with a new reference. An admin can re-check the provider ledger and update the status.</div><div class="empty-state"><strong>Need a human?</strong>WhatsApp support is available from the More menu once the live contact is connected.</div><div class="modal-actions"><button class="button button-dark" type="button" data-action="support">Open WhatsApp support <span>↗</span></button></div>' });
}

function showMore() {
  openModal({ kicker: 'MORE', title: 'Make pudata yours', intro: 'A few useful things, all in one place.', body: '<div class="drawer-links" style="margin-top:18px"><button type="button" data-action="referrals"><span>✦</span> Referral & rewards</button><button type="button" data-action="admin"><span>⌁</span> Admin console</button><button type="button" data-action="announcements"><span>!</span> Announcements</button></div>' });
}

function showAdmin() {
  openModal({ kicker: 'ADMIN CONSOLE', title: 'Operations at a glance', intro: 'Role-protected admin surfaces are ready for Supabase Auth + RLS wiring.', body: '<div class="receipt"><div class="receipt-top"><span class="receipt-status"><span class="status-dot"></span> Demo overview</span><span class="receipt-ref">admin-only</span></div><div class="receipt-rows"><div class="receipt-row"><span>Total users</span><strong>248</strong></div><div class="receipt-row"><span>Sales this month</span><strong>₦1,248,500</strong></div><div class="receipt-row"><span>Pending review</span><strong>3 transactions</strong></div><div class="receipt-row"><span>Catalogue</span><strong>Last refreshed today</strong></div></div></div><div class="modal-actions"><button class="button button-dark" type="button" data-action="refresh-catalogue">Refresh catalogue <span>↻</span></button></div><div class="modal-quiet">In production, admin access is verified server-side from profiles.role or user_roles. Client-side flags never grant access.</div>' });
}

function handleAction(action, target) {
  if (action === 'menu') openDrawer();
  if (action === 'close-menu') closeDrawer();
  if (action === 'close-modal') closeModal();
  if (action === 'home') { closeDrawer(); closeModal(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  if (action === 'profile') showProfile();
  if (action === 'browse-services' || action === 'all-services') $('#services').scrollIntoView({ behavior: 'smooth' });
  if (action === 'service') showPurchase(target.dataset.service);
  if (action === 'fund-wallet') showFundWallet();
  if (action === 'help') { closeDrawer(); showHelp(); }
  if (action === 'more') showMore();
  if (action === 'transactions') { closeDrawer(); showTransactions(); }
  if (action === 'referrals') { closeModal(); showToast('Referral rewards will appear here once your account is connected.'); }
  if (action === 'announcements') { closeModal(); showToast('No new announcements right now.'); }
  if (action === 'support') showToast('WhatsApp support is ready for your live contact link.');
  if (action === 'retry-guest-purchase') {
    const raw = localStorage.getItem('pudata_pending_guest_purchase');
    if (!raw) return;
    const pending = JSON.parse(raw);
    closeModal();
    launchFlutterwave({ amount: pending.amount, txRef: pending.tx_ref, email: pending.email, onSuccess: async (response) => {
      if (response?.status !== 'successful' && response?.status !== 'completed') return;
      try { await completeGuestPurchase(pending); } catch { showToast(`Fulfilment needs another retry with ${pending.tx_ref}.`); }
    } });
  }
  if (action === 'admin') showAdmin();
  if (action === 'refresh-catalogue') { closeModal(); showToast('Catalogue refresh queued for the secure Edge Function.'); }
  if (action === 'how-it-works') showToast('Choose a service, confirm your details, then keep the reference.');
  if (action === 'logout') { if (supabaseClient) supabaseClient.auth.signOut(); state.loggedIn = false; state.user = null; state.session = null; state.wallet = 0; updateProfile(); closeModal(); showToast('You’re signed out.'); }
}

function updateProfile() {
  $('[data-profile-label]').textContent = state.loggedIn ? (state.user?.email?.split('@')[0] || 'Member') : 'Guest';
  $('[data-wallet-balance]').textContent = state.loggedIn ? `₦${state.wallet.toLocaleString('en-NG', { minimumFractionDigits: 2 })}` : '₦0.00';
  $('[data-wallet-copy]').textContent = state.loggedIn ? 'Your wallet is ready for fast, repeat payments.' : 'Sign in to fund once and pay faster next time.';
}

function purchasePayload(kind) {
  const parameters = {};
  if (kind === 'airtime') {
    parameters.phone_number = $('#phone')?.value.trim();
    parameters.amount = Number($('#amount')?.value || 0);
  } else if (kind === 'data') {
    parameters.phone_number = $('#phone')?.value.trim();
  } else if (kind === 'tv') {
    parameters.smart_card_number = $('#customer-id')?.value.trim();
  } else if (kind === 'education' || kind === 'pins') {
    parameters.quantity = Number($('#quantity')?.value || 1);
  }
  return parameters;
}

function purchaseAmount(kind) {
  if (kind === 'airtime') return Number($('#amount')?.value || 0);
  if (kind === 'data') return 1000;
  if (kind === 'tv') return 15700;
  return 2500;
}

async function completeGuestPurchase(pending) {
  const result = await invokeFunction('create-purchase', {
    product_id: pending.product_id,
    email: pending.email,
    payment_tx_ref: pending.tx_ref,
    parameters: pending.parameters
  });
  localStorage.removeItem('pudata_pending_guest_purchase');
  const selected = services.find((service) => service.kind === pending.kind);
  state.txCount += 1;
  showReceipt({ service: selected?.title || 'Service', amount: pending.amount, email: pending.email, status: result.status || 'pending', reference: result.reference || pending.tx_ref, pin: result.details?.pins ? JSON.stringify(result.details.pins) : null });
}

async function retryPendingGuestPurchase() {
  const raw = localStorage.getItem('pudata_pending_guest_purchase');
  if (!raw || state.loggedIn) return;
  try {
    const pending = JSON.parse(raw);
    if (pending?.tx_ref) openModal({ kicker: 'PAYMENT RETRY', title: 'Finish your guest payment', intro: 'Your original payment reference is saved. Retry with the same tx_ref; pudata will not create a second payment reference.', body: `<div class="receipt"><div class="receipt-row"><span>Transaction reference</span><strong>${escapeHtml(pending.tx_ref)}</strong></div><div class="receipt-row"><span>Amount</span><strong>₦${Number(pending.amount).toLocaleString('en-NG')}</strong></div></div><div class="modal-actions"><button class="button button-dark" type="button" data-action="retry-guest-purchase">Retry checkout <span>↗</span></button></div>` });
  } catch {
    localStorage.removeItem('pudata_pending_guest_purchase');
  }
}

document.addEventListener('click', (event) => {
  const actionTarget = event.target.closest('[data-action]');
  if (actionTarget) handleAction(actionTarget.dataset.action, actionTarget);
  if (event.target.classList.contains('option')) {
    $$('.option', event.target.parentElement).forEach((option) => option.classList.remove('selected'));
    event.target.classList.add('selected');
  }
});

document.addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.target;
  if (form.id === 'login-form') {
    if (!supabaseClient) {
      showToast('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Manus.');
      return;
    }
    supabaseClient.auth.signInWithPassword({ email: $('#login-email').value.trim(), password: $('#login-password').value }).then(async ({ error }) => {
      if (error) { showToast(error.message); return; }
      await syncSession();
      closeModal();
      showToast('Signed in. Wallet balance refreshed from the server.');
    });
  }
  if (form.id === 'fund-form') {
    const amount = Number($('#fund-amount').value);
    let txRef;
    try { txRef = walletFundingRef(); } catch (error) { showToast(error.message); return; }
    const email = state.user.email;
    closeModal();
    launchFlutterwave({ amount, txRef, email, onSuccess: async (response) => {
      if (response?.status !== 'successful' && response?.status !== 'completed') { showToast('Flutterwave did not confirm this payment.'); return; }
      try {
        const verified = await invokeFunction('flutterwave-verify', { tx_ref: txRef, expected_amount: amount, purpose: 'wallet_funding' });
        if (!verified.verified) { showToast('Payment could not be verified. Your wallet was not changed.'); return; }
        await refreshWallet();
        showToast(`₦${amount.toLocaleString('en-NG')} added after server verification.`);
      } catch (error) { showToast(`Verification failed: ${error.message}`); }
      } });
  }
  if (form.id === 'purchase-form') {
    const email = $('#email')?.value || 'guest@example.com';
    const selected = services.find((service) => service.kind === state.selectedService);
    const amount = purchaseAmount(state.selectedService);
    if (state.selectedService === 'airtime' && amount < 50) {
      showToast('Airtime minimum is ₦50.');
      return;
    }
    const pending = { kind: state.selectedService, product_id: selected?.id || state.selectedService, amount, email, parameters: purchasePayload(state.selectedService), tx_ref: guestPaymentRef() };
    if (state.loggedIn) {
      invokeFunction('create-purchase', { product_id: pending.product_id, parameters: pending.parameters }).then((result) => {
        state.txCount += 1;
        showReceipt({ service: selected?.title || 'Service', amount, email: state.user.email, status: result.status || 'pending', reference: result.reference || 'PENDING', pin: result.details?.pins ? JSON.stringify(result.details.pins) : null });
        refreshWallet();
      }).catch((error) => showToast(`Purchase failed: ${error.message}`));
      return;
    }
    localStorage.setItem('pudata_pending_guest_purchase', JSON.stringify(pending));
    launchFlutterwave({ amount, txRef: pending.tx_ref, email, onSuccess: async (response) => {
      if (response?.status !== 'successful' && response?.status !== 'completed') { showToast('Flutterwave did not confirm this payment.'); return; }
      try {
        await completeGuestPurchase(pending);
      } catch (error) {
        showToast(`Payment verified, but fulfilment needs a retry with ${pending.tx_ref}.`);
      }
      } });
  }
  if (form.id === 'lookup-form') {
    invokeFunction('guest-receipt', { reference: $('#lookup-ref').value.trim(), email: $('#lookup-email').value.trim() }).then((receipt) => showReceipt({ service: receipt.service, amount: receipt.amount, email: $('#lookup-email').value.trim(), status: receipt.status, reference: receipt.reference, pin: receipt.pins ? JSON.stringify(receipt.pins) : null })).catch((error) => showToast(error.message));
  }
});

renderServices();
updateProfile();
syncSession();
