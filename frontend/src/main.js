import { createClient } from '@supabase/supabase-js';

const configuredApiBase = import.meta.env.VITE_API_BASE_URL?.trim();
const API_BASE = (configuredApiBase || (import.meta.env.DEV
  ? `http://${window.location.hostname}:8000`
  : '')).replace(/\/$/, '');
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
const localDemoMode = import.meta.env.VITE_LOCAL_DEMO === 'true';
const supabase = !localDemoMode && supabaseUrl && supabasePublishableKey ? createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
}) : null;

const appState = {
  token: localStorage.getItem('smartstock_token') || '',
  user: JSON.parse(localStorage.getItem('smartstock_user') || 'null'),
  products: [],
  sales: [],
  draftItems: [],
};

const els = {
  loginScreen: document.querySelector('#login-screen'),
  mainShell: document.querySelector('#main-shell'),
  loginForm: document.querySelector('#login-form'),
  loggedUser: document.querySelector('#logged-user'),
  topbarTitle: document.querySelector('#topbar-title'),
  configBanner: document.querySelector('#config-banner'),
  navigation: document.querySelectorAll('.nav-item'),
  views: document.querySelectorAll('.view'),
  statProducts: document.querySelector('#stat-products'),
  statSalesDay: document.querySelector('#stat-sales-day'),
  statLowStock: document.querySelector('#stat-low-stock'),
  statTotalSales: document.querySelector('#stat-total-sales'),
  recentSalesList: document.querySelector('#recent-sales-list'),
  productTableBody: document.querySelector('#product-table-body'),
  productSearch: document.querySelector('#product-search'),
  productCategoryFilter: document.querySelector('#product-category-filter'),
  inventoryTableBody: document.querySelector('#inventory-table-body'),
  productForm: document.querySelector('#product-form'),
  productId: document.querySelector('#product-id'),
  productName: document.querySelector('#product-name'),
  productDescription: document.querySelector('#product-description'),
  productCategory: document.querySelector('#product-category'),
  productPrice: document.querySelector('#product-price'),
  productQuantity: document.querySelector('#product-quantity'),
  productMinStock: document.querySelector('#product-min-stock'),
  productImageUrl: document.querySelector('#product-image-url'),
  productImageFile: document.querySelector('#product-image-file'),
  saleForm: document.querySelector('#sale-form'),
  saleProduct: document.querySelector('#sale-product'),
  saleQuantity: document.querySelector('#sale-quantity'),
  saleItemsBody: document.querySelector('#sale-items-body'),
  saleTotal: document.querySelector('#sale-total'),
  saleNotes: document.querySelector('#sale-notes'),
  salesHistoryBody: document.querySelector('#sales-history-body'),
  salesDateFilter: document.querySelector('#sales-date-filter'),
  assistantForm: document.querySelector('#assistant-form'),
  assistantInput: document.querySelector('#assistant-input'),
  assistantMessages: document.querySelector('#assistant-messages'),
  logoutBtn: document.querySelector('#logout-btn'),
  newProductBtn: document.querySelector('#new-product-btn'),
  cancelProductBtn: document.querySelector('#cancel-product-btn'),
  addSaleItemBtn: document.querySelector('#add-sale-item-btn'),
  confirmSaleBtn: document.querySelector('#confirm-sale-btn'),
};

function formatMoney(value) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
  }).format(Number(value || 0));
}

function setView(viewName) {
  els.views.forEach((view) => {
    view.classList.toggle('active', view.id === `view-${viewName}`);
  });

  els.navigation.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });

  els.topbarTitle.textContent = {
    dashboard: 'Dashboard',
    products: 'Productos',
    inventory: 'Inventario',
    sales: 'Ventas',
    history: 'Historial',
    assistant: 'Asistente IA',
  }[viewName] || 'Dashboard';
}

function updateAuthUI() {
  const user = appState.user;
  const isAdmin = user?.role === 'admin';
  if (user) {
    els.loggedUser.textContent = `${user.name} (${user.role})`;
  }

  document.querySelectorAll('.admin-only').forEach((el) => {
    el.disabled = !isAdmin;
    el.style.opacity = isAdmin ? '1' : '0.5';
  });
}

function saveSession(token, user) {
  appState.token = token;
  appState.user = user;
  if (supabase) {
    localStorage.removeItem('smartstock_token');
  } else {
    localStorage.setItem('smartstock_token', token);
  }
  localStorage.setItem('smartstock_user', JSON.stringify(user));
}

async function clearSession() {
  appState.token = '';
  appState.user = null;
  localStorage.removeItem('smartstock_token');
  localStorage.removeItem('smartstock_user');
  if (supabase) {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) {
      throw error;
    }
  }
}

async function getActiveToken() {
  if (!supabase) {
    return appState.token;
  }

  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) {
    throw error;
  }
  return session?.access_token || '';
}

async function apiFetch(url, options = {}) {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers = {
    ...(options.headers || {}),
  };

  if (!isFormData) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }

  if (supabase) {
    const token = await getActiveToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  } else if (appState.token) {
    headers.Authorization = `Bearer ${appState.token}`;
  }

  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers,
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (error) {
    data = { message: text };
  }

  if (!response.ok) {
    throw new Error(data?.detail || data?.message || 'Error en la solicitud');
  }

  return data;
}

async function bootstrap() {
  try {
    const systemStatus = await apiFetch('/api/system');
    if (!systemStatus.supabase_configured) {
      els.configBanner.textContent = systemStatus.message;
      els.configBanner.classList.remove('hidden');
    }
  } catch (error) {
    els.configBanner.textContent = 'No se pudo verificar el backend. No se cambiará automáticamente a datos locales.';
    els.configBanner.classList.remove('hidden');
  }

  if (supabase) {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) {
        throw error;
      }
      if (session?.access_token) {
        appState.token = session.access_token;
      }
    } catch (error) {
      try {
        await clearSession();
      } catch (signOutError) {
        console.error('No se pudo limpiar la sesión local de Supabase.', signOutError);
      }
    }
  }

  if (!appState.token || !appState.user) {
    showLogin();
    return;
  }

  try {
    const user = await apiFetch('/api/me');
    appState.user = user;
    saveSession(appState.token, user);
    showApp();
    await Promise.all([loadDashboard(), loadProducts(), loadSales()]);
    renderInventory();
  } catch (error) {
    try {
      await clearSession();
    } catch (signOutError) {
      console.error('No se pudo limpiar la sesión local de Supabase.', signOutError);
    }
    showLogin();
  }
}

function showLogin() {
  els.loginScreen.classList.remove('hidden');
  els.mainShell.classList.add('hidden');
}

function showApp() {
  els.loginScreen.classList.add('hidden');
  els.mainShell.classList.remove('hidden');
  updateAuthUI();
  setView('dashboard');
}

async function handleLogin(event) {
  event.preventDefault();
  const email = document.querySelector('#login-email').value.trim();
  const password = document.querySelector('#login-password').value.trim();

  try {
    if (supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        throw new Error(error.message);
      }
      const sessionToken = data.session?.access_token;
      if (!sessionToken) {
        throw new Error('No se pudo obtener el token de la sesión.');
      }
      const meResponse = await apiFetch('/api/me');
      saveSession(sessionToken, meResponse);
      showApp();
      await Promise.all([loadDashboard(), loadProducts(), loadSales()]);
      renderInventory();
      return;
    }

    const response = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    saveSession(response.token, response.user);
    showApp();
    await Promise.all([loadDashboard(), loadProducts(), loadSales()]);
    renderInventory();
  } catch (error) {
    if (supabase) {
      try {
        await clearSession();
      } catch (signOutError) {
        console.error('No se pudo limpiar la sesión local de Supabase.', signOutError);
      }
    }
    alert(error.message);
  }
}

async function loadDashboard() {
  const dashboard = await apiFetch('/api/dashboard');
  els.statProducts.textContent = dashboard.products_count;
  els.statSalesDay.textContent = dashboard.sales_today;
  els.statLowStock.textContent = dashboard.low_stock_count;
  els.statTotalSales.textContent = formatMoney(dashboard.total_revenue);

  const recentSales = dashboard.recent_sales || [];
  els.recentSalesList.innerHTML = recentSales.length
    ? recentSales
        .map(
          (sale) => `
            <li>
              <strong>${sale.seller || sale.seller_id || 'Vendedor'}</strong>
              <div class="sale-item-meta">
                <span>${new Date(sale.created_at || sale.date).toLocaleDateString('es-CL')}</span>
                <span>${formatMoney(sale.total)}</span>
              </div>
            </li>
          `
        )
        .join('')
    : '<li>No hay ventas recientes.</li>';
}

async function loadProducts() {
  const products = await apiFetch('/api/products');
  appState.products = products;
  populateCategoryFilter();
  renderProductTable();
  populateSalesSelector();
}

function populateCategoryFilter() {
  const categories = [...new Set(appState.products.map((product) => product.category))].sort();
  const currentValue = els.productCategoryFilter.value;
  els.productCategoryFilter.innerHTML = '<option value="">Todas las categorías</option>' +
    categories.map((cat) => `<option value="${cat}">${cat}</option>`).join('');
  els.productCategoryFilter.value = currentValue || '';
}

function renderProductTable() {
  const search = els.productSearch.value.trim().toLowerCase();
  const category = els.productCategoryFilter.value;

  const filtered = appState.products.filter((product) => {
    const matchesCategory = category ? product.category === category : true;
    const matchesSearch = !search || `${product.name} ${product.description} ${product.category}`.toLowerCase().includes(search);
    return matchesCategory && matchesSearch;
  });

  if (!filtered.length) {
    els.productTableBody.innerHTML = '<tr><td colspan="5">No hay productos registrados.</td></tr>';
    return;
  }

  els.productTableBody.innerHTML = filtered
    .map(
      (product) => `
        <tr>
          <td>${product.name}</td>
          <td>${product.category}</td>
          <td>${product.quantity}</td>
          <td>${formatMoney(product.price)}</td>
          <td>
            <div class="table-actions">
              <button class="icon-btn" data-edit-id="${product.id}">Editar</button>
              <button class="icon-btn admin-only" data-delete-id="${product.id}">Eliminar</button>
            </div>
          </td>
        </tr>
      `
    )
    .join('');

  document.querySelectorAll('[data-edit-id]').forEach((btn) => {
    btn.addEventListener('click', () => fillProductForm(btn.dataset.editId));
  });

  document.querySelectorAll('[data-delete-id]').forEach((btn) => {
    btn.addEventListener('click', () => deleteProduct(btn.dataset.deleteId));
  });
}

function renderInventory() {
  const list = appState.products
    .map((product) => {
      const status = Number(product.quantity) <= Number(product.min_stock) ? 'warning' : 'ok';
      const label = Number(product.quantity) === 0 ? 'Sin stock' : Number(product.quantity) <= Number(product.min_stock) ? 'Bajo' : 'Normal';
      return `
        <tr>
          <td>${product.name}</td>
          <td>${product.category}</td>
          <td>${product.quantity}</td>
          <td>${product.min_stock}</td>
          <td><span class="badge ${status}">${label}</span></td>
          <td>
            <button class="icon-btn admin-only" data-stock-id="${product.id}">Actualizar</button>
          </td>
        </tr>
      `;
    })
    .join('');

  els.inventoryTableBody.innerHTML = list || '<tr><td colspan="6">No hay inventario disponible.</td></tr>';
  document.querySelectorAll('[data-stock-id]').forEach((btn) => {
    btn.addEventListener('click', () => updateInventoryQuantity(btn.dataset.stockId));
  });
}

async function loadSales() {
  const sales = await apiFetch('/api/sales');
  appState.sales = sales;
  renderSalesHistory();
}

function renderSalesHistory() {
  const filterDate = els.salesDateFilter.value;
  const filtered = filterDate
    ? appState.sales.filter((sale) => (sale.created_at || sale.date || '').startsWith(filterDate))
    : appState.sales;

  if (!filtered.length) {
    els.salesHistoryBody.innerHTML = '<tr><td colspan="5">No hay ventas registradas.</td></tr>';
    return;
  }

  els.salesHistoryBody.innerHTML = filtered
    .map((sale) => {
      const items = sale.items || sale.sale_details || [];
      const text = items
        .map((item) => `${item.product_name || item.products?.name || 'Producto'} x${item.quantity}`)
        .join(', ');
      const total = sale.total || 0;
      const date = sale.created_at || sale.date;
      const seller = sale.seller || sale.seller_id || 'Vendedor';
      return `
        <tr>
          <td>${sale.id}</td>
          <td>${new Date(date).toLocaleString('es-CL')}</td>
          <td>${seller}</td>
          <td>${text}</td>
          <td>${formatMoney(total)}</td>
        </tr>
      `;
    })
    .join('');
}

function populateSalesSelector() {
  const options = appState.products
    .map((product) => `<option value="${product.id}">${product.name} (${product.quantity} disponibles)</option>`)
    .join('');
  els.saleProduct.innerHTML = options || '<option value="">Sin productos</option>';
}

async function handleProductSubmit(event) {
  event.preventDefault();
  const id = els.productId.value;
  const selectedFile = els.productImageFile.files[0];
  const payload = {
    name: els.productName.value,
    description: els.productDescription.value,
    category: els.productCategory.value,
    price: Number(els.productPrice.value),
    quantity: Number(els.productQuantity.value),
    min_stock: Number(els.productMinStock.value),
    image_url: els.productImageUrl.value,
  };

  try {
    let result;
    if (id) {
      result = await apiFetch(`/api/products/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      result = await apiFetch('/api/products', { method: 'POST', body: JSON.stringify(payload) });
    }

    const productId = id || result.product?.id;
    if (selectedFile && productId) {
      const formData = new FormData();
      formData.append('file', selectedFile);
      await apiFetch(`/api/products/${productId}/image`, { method: 'POST', body: formData });
    }

    resetProductForm();
    await loadProducts();
    renderInventory();
    setView('products');
  } catch (error) {
    alert(error.message);
  }
}

async function deleteProduct(productId) {
  if (!confirm('¿Deseas eliminar este producto?')) return;
  try {
    await apiFetch(`/api/products/${productId}`, { method: 'DELETE' });
    await loadProducts();
    renderInventory();
  } catch (error) {
    alert(error.message);
  }
}

function fillProductForm(productId) {
  const product = appState.products.find((item) => item.id === productId);
  if (!product) return;
  els.productId.value = product.id;
  els.productName.value = product.name;
  els.productDescription.value = product.description;
  els.productCategory.value = product.category;
  els.productPrice.value = product.price;
  els.productQuantity.value = product.quantity;
  els.productMinStock.value = product.min_stock;
  els.productImageUrl.value = product.image_url || '';
  els.productImageFile.value = '';
  setView('products');
}

function resetProductForm() {
  els.productForm.reset();
  els.productId.value = '';
  els.productImageFile.value = '';
}

function updateDraftTotal() {
  const total = appState.draftItems.reduce((sum, item) => sum + item.total, 0);
  els.saleTotal.textContent = formatMoney(total);
}

function renderDraftItems() {
  if (!appState.draftItems.length) {
    els.saleItemsBody.innerHTML = '<tr><td colspan="4">No hay productos agregados.</td></tr>';
    updateDraftTotal();
    return;
  }

  els.saleItemsBody.innerHTML = appState.draftItems
    .map(
      (item) => `
        <tr>
          <td>${item.name}</td>
          <td>${item.quantity}</td>
          <td>${formatMoney(item.unit_price)}</td>
          <td>${formatMoney(item.total)}</td>
        </tr>
      `
    )
    .join('');
  updateDraftTotal();
}

function addSaleItem() {
  const productId = els.saleProduct.value;
  const quantity = Number(els.saleQuantity.value || 0);
  if (!productId || quantity <= 0) {
    alert('Selecciona un producto y una cantidad válida');
    return;
  }

  const product = appState.products.find((item) => item.id === productId);
  if (!product) {
    alert('Producto no encontrado');
    return;
  }

  if (quantity > product.quantity) {
    alert('Cantidad superior al stock disponible');
    return;
  }

  const existing = appState.draftItems.find((item) => item.product_id === productId);
  if (existing) {
    existing.quantity += quantity;
    existing.total = existing.quantity * product.price;
  } else {
    appState.draftItems.push({
      product_id: product.id,
      name: product.name,
      unit_price: product.price,
      quantity,
      total: product.price * quantity,
    });
  }

  renderDraftItems();
  els.saleQuantity.value = 1;
}

async function confirmSale() {
  if (!appState.draftItems.length) {
    alert('Agrega productos antes de confirmar la venta');
    return;
  }

  try {
    const payload = {
      items: appState.draftItems.map((item) => ({ product_id: item.product_id, quantity: item.quantity })),
      notes: els.saleNotes.value.trim(),
    };

    await apiFetch('/api/sales', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    appState.draftItems = [];
    els.saleNotes.value = '';
    renderDraftItems();
    await Promise.all([loadDashboard(), loadProducts(), loadSales()]);
    renderInventory();
    setView('history');
  } catch (error) {
    alert(error.message);
  }
}

async function updateInventoryQuantity(productId) {
  const product = appState.products.find((item) => item.id === productId);
  const nextValue = prompt(`Ingrese la nueva cantidad para ${product.name}`, product.quantity);
  if (nextValue === null) return;

  const quantity = Number(nextValue);
  if (Number.isNaN(quantity) || quantity < 0) {
    alert('Cantidad inválida');
    return;
  }

  try {
    await apiFetch(`/api/products/${productId}/stock`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity }),
    });
    await loadProducts();
    renderInventory();
  } catch (error) {
    alert(error.message);
  }
}

async function handleAssistantSubmit(event) {
  event.preventDefault();
  const question = els.assistantInput.value.trim();
  if (!question) return;

  appendAssistantMessage('user', question);
  els.assistantInput.value = '';

  try {
    const response = await apiFetch('/api/assistant/chat', {
      method: 'POST',
      body: JSON.stringify({ message: question }),
    });
    appendAssistantMessage('bot', response.answer);
  } catch (error) {
    appendAssistantMessage('bot', error.message);
  }
}

function appendAssistantMessage(role, text) {
  const bubble = document.createElement('div');
  bubble.className = `assistant-message ${role}`;
  bubble.textContent = text;
  els.assistantMessages.appendChild(bubble);
  els.assistantMessages.scrollTop = els.assistantMessages.scrollHeight;
}

els.loginForm.addEventListener('submit', handleLogin);
els.logoutBtn.addEventListener('click', async () => {
  try {
    await clearSession();
    showLogin();
  } catch (error) {
    alert(`No se pudo cerrar la sesión de Supabase: ${error.message}`);
  }
});
els.navigation.forEach((button) => {
  button.addEventListener('click', () => setView(button.dataset.view));
});
els.productSearch.addEventListener('input', renderProductTable);
els.productCategoryFilter.addEventListener('change', renderProductTable);
els.productForm.addEventListener('submit', handleProductSubmit);
els.cancelProductBtn.addEventListener('click', resetProductForm);
els.newProductBtn.addEventListener('click', () => {
  resetProductForm();
  setView('products');
});
els.addSaleItemBtn.addEventListener('click', addSaleItem);
els.confirmSaleBtn.addEventListener('click', confirmSale);
els.salesDateFilter.addEventListener('change', renderSalesHistory);
document.querySelector('#clear-sales-filter').addEventListener('click', () => {
  els.salesDateFilter.value = '';
  renderSalesHistory();
});
els.assistantForm.addEventListener('submit', handleAssistantSubmit);

bootstrap();
