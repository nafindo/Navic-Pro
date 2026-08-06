import { useState, useEffect } from 'react'
import { fetchMasterData, fetchMerchandise, checkLoyaltyPoints, createOrder, checkOrderStatus, checkOrdersByPhone, uploadPaymentProof } from './api'
import './index.css'

const CAFE_LAT = -6.870245;
const CAFE_LNG = 112.344962;
const MAX_RADIUS = 50; // dalam meter

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // radius bumi dalam meter
  const p1 = lat1 * Math.PI / 180;
  const p2 = lat2 * Math.PI / 180;
  const dp = (lat2 - lat1) * Math.PI / 180;
  const dl = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function App() {
  const [activeTab, setActiveTab] = useState('menu');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [menuItems, setMenuItems] = useState([]);
  const [merchItems, setMerchItems] = useState([]);
  const [cart, setCart] = useState([]);
  const [phone, setPhone] = useState(localStorage.getItem('savedPhone') || '');
  const [customerName, setCustomerName] = useState(localStorage.getItem('savedCustomerName') || '');
  const [points, setPoints] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  // Variant Modal State
  const [selectedProductForVariant, setSelectedProductForVariant] = useState(null);
  const [variantSelections, setVariantSelections] = useState({});
  const [variantNotes, setVariantNotes] = useState('');
  const [variantQty, setVariantQty] = useState(1);

  // Checkout State
  const [showCheckout, setShowCheckout] = useState(false);
  const [orderType, setOrderType] = useState('Delivery'); // Dine-In or Delivery
  const [tableNumber, setTableNumber] = useState('');
  const [address, setAddress] = useState('');
  const [location, setLocation] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Tunai'); // Tunai or Transfer
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [orderId, setOrderId] = useState('');
  const [pollingOngkir, setPollingOngkir] = useState(false);
  const [finalOrderData, setFinalOrderData] = useState(null);

  // Check Order State
  const [trackOrderId, setTrackOrderId] = useState(localStorage.getItem('lastOrderId') || '');
  const [trackOrderResult, setTrackOrderResult] = useState(null);
  const [trackOrdersList, setTrackOrdersList] = useState(null);
  const [isTracking, setIsTracking] = useState(false);
  const [isUploadingPayment, setIsUploadingPayment] = useState({});

  // Security States
  const [sessionExpired, setSessionExpired] = useState(false);
  const [gpsBlocked, setGpsBlocked] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [isCallingWaiter, setIsCallingWaiter] = useState({});

  useEffect(() => {
    // Auto detect table from URL if any
    const params = new URLSearchParams(window.location.search);
    const mejaUrl = params.get('meja');
    if (mejaUrl) {
      setTableNumber(mejaUrl);
      setOrderType('Dine-In');

      // 1. Session Check (1 Jam)
      const sessionKey = 'resto_session_meja';
      const sessionData = JSON.parse(localStorage.getItem(sessionKey) || '{}');
      const now = Date.now();
      let isExpired = false;
      if (sessionData.meja === mejaUrl && (now - sessionData.timestamp >= 3600000)) {
        isExpired = true;
        setSessionExpired(true);
        localStorage.removeItem(sessionKey);
      } else if (sessionData.meja !== mejaUrl || !sessionData.timestamp) {
        localStorage.setItem(sessionKey, JSON.stringify({ meja: mejaUrl, timestamp: now }));
      }

      // 2. GPS Geofencing Check (50m)
      if (!isExpired) {
        if ('geolocation' in navigator) {
          setGpsLoading(true);
          navigator.geolocation.getCurrentPosition(
            (position) => {
              const dist = getDistance(CAFE_LAT, CAFE_LNG, position.coords.latitude, position.coords.longitude);
              if (dist > MAX_RADIUS) setGpsBlocked(true);
              setGpsLoading(false);
            },
            (error) => {
              setGpsBlocked(true); // Jika ditolak atau error, blokir
              setGpsLoading(false);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
          );
        } else {
          setGpsBlocked(true);
        }
      }
    }
    loadData();
  }, []);

  useEffect(() => {
    let interval;
    if (pollingOngkir && orderId) {
      interval = setInterval(async () => {
        try {
          const res = await checkOrderStatus(orderId);
          if (res.success && res.data) {
            const status = res.data.status_pesanan;
            if (status !== 'MENUNGGU ONGKIR' && status !== 'PESANAN BARU') {
              setFinalOrderData(res.data);
              setPollingOngkir(false);
            }
          }
        } catch (e) {
          console.error(e);
        }
      }, 5000);
    }
    return () => clearInterval(interval);
  }, [pollingOngkir, orderId]);

  // Auto-refresh pesanan setiap 15 detik ketika tab orders aktif
  useEffect(() => {
    let interval;
    if (activeTab === 'orders') {
      const savedPhone = phone || localStorage.getItem('savedPhone');
      if (savedPhone) {
        // Fetch langsung saat tab dibuka
        (async () => {
          setIsTracking(true);
          const res = await checkOrdersByPhone(savedPhone);
          setIsTracking(false);
          if (res.success && res.data) setTrackOrdersList(res.data);
          else setTrackOrdersList([]);
        })();
        // Auto-refresh setiap 15 detik
        interval = setInterval(async () => {
          const res = await checkOrdersByPhone(savedPhone);
          if (res.success && res.data) setTrackOrdersList(res.data);
        }, 15000);
      }
    }
    return () => clearInterval(interval);
  }, [activeTab, phone]);

  const loadData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetchMasterData();
      const merchRes = await fetchMerchandise();

      if (res.success && res.data && res.data.produk) {
        const allProducts = res.data.produk.filter(p => p.is_tersedia);
        const isMerch = (p) => p.kategori && (p.kategori.toLowerCase() === 'merchandise' || p.kategori.toLowerCase() === 'hadiah' || p.kategori.toLowerCase().includes('tukar poin'));
        setMenuItems(allProducts.filter(p => !isMerch(p)));
      } else {
        setErrorMsg("Gagal memuat data menu dari server.");
      }

      if (merchRes.success && merchRes.data) {
        // Map merchandise data to match cart item structure
        const mappedMerch = merchRes.data
          .filter(m => parseInt(m.stok) > 0)
          .map(m => ({
            id_produk: m.id_merchandise,
            nama_menu: m.nama,
            harga: parseInt(m.poin) || 0,
            image_url: m.image_url,
            kategori: 'Merchandise'
          }));
        setMerchItems(mappedMerch);
      }
    } catch (e) {
      setErrorMsg("Koneksi error: " + e.message);
    }
    setLoading(false);
  };

  const handleCheckPoints = async () => {
    if (phone.length < 9) return;
    localStorage.setItem('savedPhone', phone);
    const res = await checkLoyaltyPoints(phone);
    if (res.success && res.data) {
      setPoints(res.data.total_poin);
      if (res.data.nama) {
        setCustomerName(res.data.nama);
        localStorage.setItem('savedCustomerName', res.data.nama);
      }
    } else {
      setPoints(0);
    }
  };

  const handleProductClick = (item) => {
    if (!item.is_tersedia) return;

    // Check if item has variants
    if (item.varian) {
      let parsedVariants = null;
      try {
        parsedVariants = JSON.parse(item.varian);
      } catch (e) {
        console.error("Gagal parse varian:", e);
        alert("Gagal membaca data varian: " + e.message + "\n\nVarian String: " + item.varian);
      }

      if (parsedVariants && Array.isArray(parsedVariants) && parsedVariants.length > 0) {
        // Initialize default selections (e.g. first radio option)
        const initialSelections = {};
        parsedVariants.forEach(group => {
          if (!group.isMultiple && group.options && group.options.length > 0) {
            initialSelections[group.groupName] = group.options[0].name;
          } else if (group.isMultiple) {
            initialSelections[group.groupName] = {};
          }
        });

        setSelectedProductForVariant({ ...item, parsedVariants });
        setVariantSelections(initialSelections);
        setVariantNotes('');
        setVariantQty(1);
        return;
      }
    }

    // If no variants, add directly
    addToCart(item);
  };

  const addToCart = (item, customVarianText = '', customPrice = null) => {
    // Merging logic: same product ID, same variants, same custom price
    const existing = cart.find(c =>
      c.id_produk === item.id_produk &&
      (c.varian_text || '') === customVarianText &&
      (c.custom_price === customPrice)
    );

    if (existing) {
      setCart(cart.map(c => c.cartItemId === existing.cartItemId ? { ...c, qty: c.qty + (item.qty || 1) } : c));
    } else {
      setCart([...cart, {
        ...item,
        cartItemId: Date.now() + Math.random().toString(36).substr(2, 9),
        qty: item.qty || 1,
        varian_text: customVarianText,
        custom_price: customPrice !== null ? customPrice : item.harga
      }]);
    }
  };

  const handleVariantSubmit = () => {
    let extraPrice = 0;
    const variantParts = [];

    selectedProductForVariant.parsedVariants.forEach(group => {
      if (!group.isMultiple) {
        const sel = variantSelections[group.groupName];
        if (sel) {
          const opt = group.options.find(o => o.name === sel);
          if (opt) {
            extraPrice += opt.price || 0;
            if (opt.price > 0) {
              variantParts.push(`${sel} (+Rp ${opt.price.toLocaleString('id-ID')})`);
            } else {
              variantParts.push(`${sel}`);
            }
          }
        }
      } else {
        const selObj = variantSelections[group.groupName] || {};
        const selectedNames = Object.keys(selObj).filter(k => selObj[k] > 0);
        selectedNames.forEach(name => {
          const qty = selObj[name];
          const opt = group.options.find(o => o.name === name);
          if (opt) {
            extraPrice += (opt.price || 0) * qty;
            if (qty > 1) {
              variantParts.push(`${name} x${qty}`);
            } else {
              variantParts.push(`${name}`);
            }
          }
        });
      }
    });

    const customPrice = parseInt(selectedProductForVariant.harga) + extraPrice;
    const varianText = variantParts.join(', ');

    const itemToAdd = {
      ...selectedProductForVariant,
      qty: variantQty,
      catatan: variantNotes
    };

    addToCart(itemToAdd, varianText, customPrice);
    setSelectedProductForVariant(null);
  };

  const removeFromCart = (cartItemId) => {
    const existing = cart.find(c => c.cartItemId === cartItemId);
    if (!existing) return;
    if (existing.qty > 1) {
      setCart(cart.map(c => c.cartItemId === cartItemId ? { ...c, qty: c.qty - 1 } : c));
    } else {
      setCart(cart.filter(c => c.cartItemId !== cartItemId));
    }
  };

  const handleCallWaiter = async (order) => {
    setIsCallingWaiter(prev => ({ ...prev, [order.order_id]: true }));
    try {
      const res = await fetch(SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          action: 'CUSTOMER_CALL_WAITER',
          order_id: order.order_id,
          nomor_meja: order.nomor_meja || '-'
        })
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message || "Pelayan akan segera datang.");
      } else {
        alert("Gagal memanggil pelayan: " + data.message);
      }
    } catch (e) {
      alert("Terjadi kesalahan jaringan.");
    } finally {
      setIsCallingWaiter(prev => ({ ...prev, [order.order_id]: false }));
      // Optional: Give a 10 seconds cooldown before they can call again? 
      // Handled via simple alert for now.
    }
  };

  const cartTotalRupiah = cart.filter(c => {
    const isMerch = c.kategori && (c.kategori.toLowerCase() === 'merchandise' || c.kategori.toLowerCase() === 'hadiah' || c.kategori.toLowerCase().includes('tukar poin'));
    return !isMerch;
  }).reduce((sum, item) => sum + ((item.custom_price !== undefined ? item.custom_price : item.harga || 0) * item.qty), 0);

  const cartTotalPoin = cart.filter(c => {
    const isMerch = c.kategori && (c.kategori.toLowerCase() === 'merchandise' || c.kategori.toLowerCase() === 'hadiah' || c.kategori.toLowerCase().includes('tukar poin'));
    return isMerch;
  }).reduce((sum, item) => sum + ((item.custom_price !== undefined ? item.custom_price : item.harga || 0) * item.qty), 0);
  const cartTotal = cartTotalRupiah; // for display in checkout button
  const cartItemCount = cart.reduce((sum, item) => sum + item.qty, 0);

  const getGPSLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        setLocation(`${pos.coords.latitude}, ${pos.coords.longitude}`);
      }, (err) => {
        alert("Gagal mendapatkan lokasi GPS.");
      });
    } else {
      alert("Browser tidak support GPS.");
    }
  };

  const submitOrder = async () => {
    if (!customerName) return alert("Mohon masukkan nama Anda!");
    if (!phone) return alert("Mohon masukkan Nomor HP / WA Anda!");
    if (orderType === 'Delivery') {
      if (!address) return alert("Mohon masukkan alamat pengiriman lengkap!");
      if (!location) return alert("Mohon klik tombol '📍 Ambil Koordinat GPS (ShareLoc)' agar kurir bisa mengantar pesanan Anda!");
    }
    if (cartTotalPoin > 0) {
      if (points === null) return alert("Silakan Cek Poin terlebih dahulu sebelum menukar hadiah!");
      if (points < cartTotalPoin) return alert(`Poin tidak cukup! Poin Anda: ${points}, Butuh: ${cartTotalPoin}`);
    }

    setLoading(true);
    const newOrderId = (orderType === 'Dine-In' ? "SELF-" : "WEB-") + Date.now().toString().slice(-6);

    // Convert cart items to matching format
    const items = cart.map(c => {
      const price = c.custom_price !== undefined ? c.custom_price : c.harga;
      const combinedNotes = c.varian_text ? (c.catatan ? c.varian_text + " | " + c.catatan : c.varian_text) : (c.catatan || "");

      return {
        id_produk: c.id_produk,
        nama_menu: c.nama_menu,
        harga_satuan: price,
        qty: c.qty,
        catatan: combinedNotes,
        subtotal: price * c.qty
      };
    });

    const payload = {
      order_id: newOrderId,
      nama_pelanggan: customerName,
      no_hp_pelanggan: phone,
      jenis_pesanan: orderType,
      nomor_meja: orderType === 'Dine-In' ? tableNumber : '',
      alamat_pengiriman: orderType === 'Delivery' ? address : '',
      koordinat_lokasi: location,
      metode_bayar: (orderType === 'Delivery' && (paymentMethod === 'Tunai' || paymentMethod === 'QRIS')) ? 'COD' : ((orderType === 'Dine-In' && (paymentMethod === 'COD' || paymentMethod === 'Transfer')) ? 'Tunai' : paymentMethod),
      items: items,
      subtotal: cartTotalRupiah,
      pajak_ppn: 0,
      diskon: 0,
      total_bayar: cartTotalRupiah,
      poin_didapat: Math.floor(cartTotalRupiah / 10000), // contoh: 1 poin per 10rb
      poin_ditukar: cartTotalPoin
    };

    // Override metode bayar jika hanya tukar poin
    if (cartTotalRupiah === 0 && cartTotalPoin > 0) {
      payload.metode_bayar = 'Tukar Poin';
    }

    const res = await createOrder(payload);
    if (res.success) {
      setOrderId(newOrderId);
      localStorage.setItem('lastOrderId', newOrderId);
      setOrderSuccess(true);
      if (orderType === 'Delivery') {
        setPollingOngkir(true);
        setFinalOrderData(null);
      }
      setCart([]);
    } else {
      alert("Gagal memproses pesanan: " + res.message);
    }
    setLoading(false);
  };

  if (orderSuccess) {
    if (orderType === 'Delivery' && !finalOrderData) {
      return (
        <div className="app-container" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '20px', textAlign: 'center' }}>
          <div className="glass-card" style={{ padding: '40px', width: '100%' }}>
            <div className="spinner" style={{ marginBottom: '20px', border: '4px solid rgba(16, 185, 129, 0.3)', borderTop: '4px solid #10B981', borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite', margin: '0 auto' }}></div>
            <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
            <h2>Menunggu Konfirmasi...</h2>
            <p style={{ margin: '16px 0' }}>Order ID: <b>{orderId}</b></p>
            <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
              Mohon tunggu sejenak. Kasir sedang mengecek lokasi Anda untuk menghitung Ongkos Kirim. Halaman ini akan otomatis menampilkan Nota Anda.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="app-container" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '20px', textAlign: 'center' }}>
        <div className="glass-card" style={{ padding: '40px', width: '100%' }}>
          <h2 style={{ color: '#10B981', fontSize: '3rem', marginBottom: '16px' }}>✓</h2>
          <h2>Pesanan Berhasil Disetujui!</h2>
          <p style={{ margin: '16px 0' }}>Order ID: <b>{orderId}</b></p>

          {finalOrderData && (
            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', marginBottom: '24px', textAlign: 'left' }}>
              <h4 style={{ marginBottom: '12px', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>Rincian Biaya (Nota)</h4>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.9rem' }}>
                <span>Subtotal Pesanan:</span>
                <span>Rp {finalOrderData.subtotal.toLocaleString('id-ID')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.9rem' }}>
                <span>Ongkos Kirim:</span>
                <span>Rp {(finalOrderData.ongkir || 0).toLocaleString('id-ID')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', paddingTop: '12px', borderTop: '1px dashed #cbd5e1', fontWeight: 'bold', fontSize: '1.1rem' }}>
                <span>Total Tagihan:</span>
                <span style={{ color: '#10B981' }}>Rp {(finalOrderData.subtotal + (finalOrderData.ongkir || 0)).toLocaleString('id-ID')}</span>
              </div>
            </div>
          )}

          <p style={{color: 'var(--text-muted)', marginBottom: '24px'}}>
            {orderType === 'Delivery' 
              ? "Pesanan Anda sedang disiapkan dan akan segera diantar oleh kurir." 
              : "Silakan tunggu di meja Anda, pesanan akan segera dihidangkan."}
          </p>
          <button className="add-btn" style={{width: '100%', marginBottom: '12px'}} onClick={() => {setOrderSuccess(false); setShowCheckout(false); setFinalOrderData(null); setActiveTab('orders'); setTrackOrderId(orderId);}}>Pantau Pesanan</button>
          <button className="add-btn" style={{width: '100%', background: '#e2e8f0', color: '#475569'}} onClick={() => {setOrderSuccess(false); setShowCheckout(false); setFinalOrderData(null);}}>Kembali ke Menu</button>
        </div>
      </div>
    );
  }
  if (gpsLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', padding: '20px', textAlign: 'center', background: '#f8fafc' }}>
        <h2 style={{ color: 'var(--primary)', marginBottom: '10px' }}>📍 Memeriksa Lokasi...</h2>
        <p>Mohon tunggu sebentar, kami sedang memastikan Anda berada di dalam area Cafe.</p>
        <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '10px' }}>(Pastikan Anda mengizinkan akses GPS/Lokasi saat diminta browser)</p>
      </div>
    );
  }

  if (gpsBlocked) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', padding: '20px', textAlign: 'center', background: '#f8fafc' }}>
        <h2 style={{ color: '#ef4444', marginBottom: '10px' }}>Anda Berada di Luar Area Cafe 🛑</h2>
        <p style={{ marginBottom: '20px' }}>Sistem mendeteksi Anda tidak berada dalam radius cafe, atau Anda menolak memberikan izin lokasi.</p>
        <p style={{ marginBottom: '30px', fontWeight: 'bold' }}>Jika ingin pesan antar ke rumah, silakan beralih ke mode Delivery.</p>
        <button onClick={() => window.location.href = window.location.pathname} style={{ background: 'var(--primary)', color: 'white', border: 'none', padding: '12px 24px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '1.1rem' }}>🛵 Beralih ke Layanan Antar</button>
      </div>
    );
  }

  if (sessionExpired) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', padding: '20px', textAlign: 'center', background: '#f8fafc' }}>
        <h2 style={{ color: '#f59e0b', marginBottom: '10px' }}>Sesi Anda Telah Berakhir ⏱️</h2>
        <p style={{ marginBottom: '20px' }}>Waktu pemesanan untuk meja ini (1 jam) telah habis demi keamanan transaksi.</p>
        <p style={{ marginBottom: '30px', fontWeight: 'bold' }}>Jika Anda masih berada di restoran, silakan Scan Ulang QR Code di meja atau tekan tombol di bawah ini.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', maxWidth: '300px' }}>
          <button onClick={() => window.location.reload()} style={{ background: '#10B981', color: 'white', border: 'none', padding: '12px 24px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '1rem' }}>📷 Mulai Sesi Baru</button>
          <button onClick={() => window.location.href = window.location.pathname} style={{ background: 'var(--primary)', color: 'white', border: 'none', padding: '12px 24px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '1rem' }}>🛵 Beralih ke Pesan Antar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Header */}
      <header className="glass-header">
        <div className="header-content">
          <div className="logo-section">
            <img src="/Navic-Pro/crunchy_logo.png" alt="Navic Pro" style={{ height: '40px' }} onError={(e) => { e.target.style.display = 'none' }} />
            <div>
              <h1>Navic Pro</h1>
              <div className="slogan">Aplikasi Pintar Restoran Modern</div>
            </div>
          </div>
          <div className="loyalty-badge">
            <span className="pts-label">Poin Anda:</span>
            <span className="pts-value">{points !== null ? `${points} Pts` : 'Login'}</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content" style={{ display: showCheckout ? 'none' : 'block' }}>
        <div className="hero-banner" style={{ position: 'relative', overflow: 'hidden' }}>
          {orderType === 'Dine-In' && tableNumber && (
            <div style={{
              position: 'absolute',
              top: '-5px',
              right: '-10px',
              fontSize: '4.5rem',
              fontWeight: 'normal',
              fontFamily: '"Monoton", "Rudolf Koch", cursive',
              color: 'rgba(255, 255, 255, 0.4)',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              zIndex: 0,
              userSelect: 'none',
              letterSpacing: '1px'
            }}>
              {tableNumber.replace('-', ' ')}
            </div>
          )}

          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
              <img src="/Navic-Pro/navic_pro_logo.png" alt="Crunchy Logo" style={{ height: '60px', objectFit: 'contain', filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.2))' }} onError={(e) => e.target.style.display = 'none'} />
              <h2 style={{ fontSize: '2.5rem', fontWeight: '900', color: 'white', margin: 0, letterSpacing: '-1px' }}>Crunchy.co</h2>
            </div>
            <p style={{ marginTop: '4px', fontWeight: '500' }}>Hai {customerName ? customerName : 'Pelanggan'}, silakan pilih menu favorit Anda.</p>

            <div style={{ marginTop: '15px', display: 'flex', gap: '10px' }}>
              <input
                type="tel"
                placeholder="Masukkan No HP / WA"
                value={phone}
                onChange={(e) => {setPhone(e.target.value); localStorage.setItem('savedPhone', e.target.value);}}
                style={{ padding: '8px', borderRadius: '8px', border: '1px solid #ccc', flex: 1 }}
              />
              <button onClick={handleCheckPoints} style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 12px' }}>Cek Poin</button>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="tab-navigation">
          <button
            className={`tab-btn ${activeTab === 'menu' ? 'active' : ''}`}
            onClick={() => setActiveTab('menu')}
          >
            Makanan & Minuman
          </button>
          <button
            className={`tab-btn ${activeTab === 'merch' ? 'active' : ''}`}
            onClick={() => setActiveTab('merch')}
          >
            Tukar Poin
          </button>
          <button
            className={`tab-btn ${activeTab === 'orders' ? 'active' : ''}`}
            onClick={() => setActiveTab('orders')}
          >
            Pesanan Anda
          </button>
        </div>

        {/* Products Grid */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>Memuat Data...</div>
        ) : errorMsg ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'red' }}>
            {errorMsg}
            <br /><br />
            <button onClick={loadData} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: 'var(--primary)', color: '#fff' }}>Coba Lagi</button>
          </div>
        ) : (
          <div className="products-grid">
            {activeTab === 'menu' && (() => {
              const uniqueCategories = [...new Set(menuItems.map(item => item.kategori).filter(Boolean))];
              if (uniqueCategories.length === 0) return null;

              const categoryCards = [
                ...uniqueCategories.map(cat => {
                  const firstItem = menuItems.find(m => m.kategori === cat && m.image_url);
                  let catImage = 'https://cdn-icons-png.flaticon.com/512/3170/3170733.png'; // fallback image
                  if (firstItem && firstItem.image_url) {
                    let fileId = null;
                    if (firstItem.image_url.includes('drive.google.com/file/d/')) {
                      const match = firstItem.image_url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
                      if (match) fileId = match[1];
                    } else if (firstItem.image_url.includes('drive.google.com/uc')) {
                      const match = firstItem.image_url.match(/id=([a-zA-Z0-9_-]+)/);
                      if (match) fileId = match[1];
                    }
                    if (fileId) {
                      catImage = `https://lh3.googleusercontent.com/d/${fileId}`;
                    }
                  }
                  return { name: cat, image: catImage };
                })
              ];

              return (
                <div className="category-scroll-container" style={{ gridColumn: '1 / -1' }}>
                  {categoryCards.map(cat => (
                    <div
                      key={cat.name}
                      className={`category-card ${selectedCategory === cat.name ? 'active' : ''}`}
                      onClick={() => setSelectedCategory(cat.name)}
                    >
                      <img src={cat.image} alt={cat.name} className="category-img" onError={(e) => { e.target.src = 'https://cdn-icons-png.flaticon.com/512/3170/3170733.png' }} />
                      <span className="category-name">{cat.name}</span>
                    </div>
                  ))}
                </div>
              );
            })()}

            {activeTab === 'orders' && (() => {
              const savedPhone = phone || localStorage.getItem('savedPhone');
              const statusColor = (s) => {
                if (s === 'SIAP' || s === 'SIAP SAJI' || s === 'OTW') return {bg: '#d1fae5', color: '#059669'};
                if (s === 'SELESAI') return {bg: '#f1f5f9', color: '#64748b'};
                if (s === 'DIBATALKAN') return {bg: '#fee2e2', color: '#dc2626'};
                if (s === 'VERIFIKASI PEMBAYARAN') return {bg: '#dbeafe', color: '#1d4ed8'};
                if (s === 'DIKIRIM' || s === 'DALAM PENGIRIMAN') return {bg: '#e0e7ff', color: '#4338ca'};
                if (s === 'MEMASAK') return {bg: '#fff7ed', color: '#ea580c'};
                if (s === 'DITERIMA KASIR') return {bg: '#ecfdf5', color: '#047857'};
                return {bg: '#fef3c7', color: '#d97706'};
              };
              const statusLabel = (s) => {
                if (s === 'PESANAN BARU') return '⏳ Menunggu Konfirmasi';
                if (s === 'MENUNGGU ONGKIR') return '⏳ Menunggu Ongkir';
                if (s === 'MENUNGGU PEMBAYARAN') return '💳 Menunggu Pembayaran';
                if (s === 'VERIFIKASI PEMBAYARAN') return '🔍 Verifikasi Pembayaran';
                if (s === 'DITERIMA KASIR') return '✅ Diterima Kasir';
                if (s === 'MEMASAK') return '🍳 Sedang Dimasak';
                if (s === 'SEDANG DIPROSES' || s === 'Sedang Diproses') return '🍳 Sedang Diproses';
                if (s === 'SIAP' || s === 'SIAP SAJI') return '✅ Pesanan Siap';
                if (s === 'DALAM PENGIRIMAN') return '🛵 Dalam Pengiriman';
                if (s === 'OTW' || s === 'DIKIRIM') return '🚀 Sedang Diantar';
                if (s === 'SELESAI') return '🎉 Selesai';
                if (s === 'DIBATALKAN') return '❌ Dibatalkan';
                return s;
              };


              const doRefresh = async () => {
                if (!savedPhone) return;
                setIsTracking(true);
                const res = await checkOrdersByPhone(savedPhone);
                setIsTracking(false);
                if (res.success && res.data) setTrackOrdersList(res.data);
                else setTrackOrdersList([]);
              };

              const compressImage = (file) => {
                return new Promise((resolve) => {
                  const reader = new FileReader();
                  reader.onload = (event) => {
                    const img = new Image();
                    img.onload = () => {
                      const canvas = document.createElement('canvas');
                      const MAX_WIDTH = 800;
                      const MAX_HEIGHT = 800;
                      let width = img.width;
                      let height = img.height;

                      if (width > height) {
                        if (width > MAX_WIDTH) {
                          height *= MAX_WIDTH / width;
                          width = MAX_WIDTH;
                        }
                      } else {
                        if (height > MAX_HEIGHT) {
                          width *= MAX_HEIGHT / height;
                          height = MAX_HEIGHT;
                        }
                      }
                      canvas.width = width;
                      canvas.height = height;
                      const ctx = canvas.getContext('2d');
                      ctx.drawImage(img, 0, 0, width, height);
                      const compressedBase64 = canvas.toDataURL('image/jpeg', 0.6);
                      resolve(compressedBase64);
                    };
                    img.src = event.target.result;
                  };
                  reader.readAsDataURL(file);
                });
              };

              const handleFileChange = async (e, orderId) => {
                const file = e.target.files[0];
                if (!file) return;
                
                setIsUploadingPayment(prev => ({...prev, [orderId]: true}));
                try {
                  const base64String = await compressImage(file);
                  const res = await uploadPaymentProof(orderId, base64String);
                  
                  if (res.success) {
                    alert("Bukti transfer berhasil diunggah! Menunggu verifikasi kasir.");
                    doRefresh();
                  } else {
                    alert("Gagal mengunggah bukti: " + res.message);
                  }
                } catch (error) {
                  alert("Gagal memproses gambar.");
                } finally {
                  setIsUploadingPayment(prev => ({...prev, [orderId]: false}));
                }
              };

              return (
                <div style={{ gridColumn: '1 / -1', minHeight: '300px' }}>
                  {isTracking && !trackOrdersList && (
                    <div style={{textAlign: 'center', padding: '60px 20px', color: '#94a3b8'}}>
                      <div className="spinner" style={{border: '4px solid rgba(16, 185, 129, 0.3)', borderTop: '4px solid #10B981', borderRadius: '50%', width: '36px', height: '36px', animation: 'spin 1s linear infinite', margin: '0 auto 16px'}}></div>
                      Memuat pesanan...
                    </div>
                  )}

                  {!isTracking && !savedPhone && (
                    <div style={{textAlign: 'center', padding: '60px 20px', color: '#94a3b8', background: 'white', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'}}>
                      <span style={{fontSize: '3.5rem', display: 'block', marginBottom: '12px'}}>📱</span>
                      <p style={{fontSize: '1.1rem', fontWeight: '600', color: '#475569', marginBottom: '8px'}}>Masukkan Nomor HP</p>
                      <p style={{fontSize: '0.9rem'}}>Silakan masukkan nomor HP Anda di kolom atas dan tekan "Cek Poin" agar pesanan bisa ditampilkan.</p>
                    </div>
                  )}

                  {!isTracking && trackOrdersList && trackOrdersList.length === 0 && (
                    <div style={{textAlign: 'center', padding: '60px 20px', color: '#94a3b8', background: 'white', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'}}>
                      <span style={{fontSize: '3.5rem', display: 'block', marginBottom: '12px'}}>📋</span>
                      <p style={{fontSize: '1.1rem', fontWeight: '600', color: '#475569', marginBottom: '8px'}}>Belum Ada Pesanan</p>
                      <p style={{fontSize: '0.9rem'}}>Tidak ditemukan pesanan untuk nomor {savedPhone}.</p>
                      <button onClick={doRefresh} style={{marginTop: '16px', background: 'var(--primary)', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold'}}>🔄 Coba Lagi</button>
                    </div>
                  )}

                  {trackOrdersList && trackOrdersList.length > 0 && (
                    <div style={{display: 'flex', flexDirection: 'column', gap: '16px'}}>
                      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                        <h3 style={{margin: 0, color: '#1e293b', fontSize: '1.1rem'}}>Pesanan Terbaru</h3>
                        <button onClick={doRefresh} disabled={isTracking} style={{background: 'none', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '6px 14px', fontSize: '0.85rem', cursor: 'pointer', color: '#64748b', fontWeight: '600'}}>{isTracking ? '⏳' : '🔄'} Refresh</button>
                      </div>
                      {trackOrdersList.map((order, oi) => (
                        <div key={oi} style={{background: 'white', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', overflow: 'hidden', animation: 'fadeInUp 0.3s ease'}}>
                          {/* Header */}
                          <div style={{background: `linear-gradient(135deg, ${statusColor(order.status_pesanan).color}22, ${statusColor(order.status_pesanan).color}11)`, padding: '16px 20px', borderBottom: '1px solid #e2e8f0'}}>
                            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px'}}>
                              <span style={{fontSize: '0.85rem', color: '#64748b', fontWeight: '600'}}>#{order.order_id}</span>
                              {order.nomor_meja && <span style={{fontSize: '0.8rem', color: '#64748b'}}>🪑 {order.nomor_meja}</span>}
                            </div>
                            <div style={{display: 'inline-block', background: statusColor(order.status_pesanan).bg, color: statusColor(order.status_pesanan).color, padding: '6px 14px', borderRadius: '20px', fontWeight: 'bold', fontSize: '0.9rem'}}>
                              {statusLabel(order.status_pesanan)}
                            </div>
                          </div>

                          {/* Items */}
                          <div style={{padding: '12px 20px'}}>
                            {order.items && order.items.length > 0 ? (
                              order.items.map((item, idx) => (
                                <div key={idx} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '8px 0', borderBottom: idx < order.items.length - 1 ? '1px solid #f1f5f9' : 'none'}}>
                                  <div style={{flex: 1}}>
                                    <div style={{fontWeight: '600', fontSize: '0.88rem'}}>{item.nama_menu}</div>
                                    {item.catatan && <div style={{fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic'}}>{item.catatan}</div>}
                                    <div style={{fontSize: '0.75rem', color: '#64748b'}}>{item.qty}x @ Rp {(item.harga_satuan || 0).toLocaleString('id-ID')}</div>
                                  </div>
                                  <div style={{fontWeight: 'bold', fontSize: '0.85rem', whiteSpace: 'nowrap'}}>Rp {(item.subtotal || 0).toLocaleString('id-ID')}</div>
                                </div>
                              ))
                            ) : (
                              <div style={{color: '#94a3b8', fontSize: '0.85rem', padding: '4px 0'}}>Detail item tidak tersedia</div>
                            )}
                          </div>

                          {/* Total with Ongkir breakdown */}
                          <div style={{padding: '12px 20px', background: '#f8fafc', borderTop: '2px dashed #e2e8f0'}}>
                            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px'}}>
                              <div style={{fontSize: '0.8rem', color: '#94a3b8'}}>Subtotal</div>
                              <div style={{fontSize: '0.85rem', color: '#475569'}}>Rp {(order.subtotal || 0).toLocaleString('id-ID')}</div>
                            </div>
                            {order.ongkir > 0 && (
                              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px'}}>
                                <div style={{fontSize: '0.8rem', color: '#94a3b8'}}>🚚 Ongkir</div>
                                <div style={{fontSize: '0.85rem', color: '#475569'}}>Rp {Number(order.ongkir).toLocaleString('id-ID')}</div>
                              </div>
                            )}
                            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '6px', borderTop: '1px solid #e2e8f0'}}>
                              <div style={{fontSize: '0.8rem', color: '#94a3b8'}}>💳 {order.metode_bayar}</div>
                              <div style={{fontWeight: 'bold', fontSize: '1.1rem', color: 'var(--primary)'}}>Rp {Math.max((order.total_bayar || 0), ((order.subtotal || 0) + (Number(order.ongkir) || 0))).toLocaleString('id-ID')}</div>
                            </div>
                          </div>

                          {/* Payment Upload Section */}
                          {order.status_pesanan === 'MENUNGGU PEMBAYARAN' && (order.metode_bayar === 'Transfer' || order.metode_bayar === 'QRIS') && (
                            <div style={{padding: '16px 20px', background: '#eff6ff', borderTop: '1px solid #bfdbfe'}}>
                              <p style={{fontSize: '0.85rem', color: '#1e3a8a', marginBottom: '12px'}}>
                                Silakan lakukan pembayaran ke QRIS berikut, lalu unggah bukti transfer Anda:
                              </p>
                              <div style={{background: 'white', padding: '10px', borderRadius: '8px', textAlign: 'center', marginBottom: '12px', border: '1px solid #dbeafe'}}>
                                <img src="/qris.jpg" alt="QRIS Crunchy.co" style={{width: '200px', height: '200px', objectFit: 'contain', background: '#f1f5f9'}} />
                                <div style={{marginTop: '10px'}}>
                                  <a href="/qris.jpg" download="QRIS_Crunchy.jpg" style={{fontSize: '0.85rem', color: 'white', background: '#1e3a8a', padding: '8px 16px', borderRadius: '6px', textDecoration: 'none', display: 'inline-block', fontWeight: 'bold'}}>
                                    ⬇️ Download QRIS
                                  </a>
                                </div>
                              </div>
                              
                              <label style={{display: 'block', background: isUploadingPayment[order.order_id] ? '#93c5fd' : '#2563eb', color: 'white', textAlign: 'center', padding: '10px', borderRadius: '8px', fontWeight: 'bold', fontSize: '0.9rem', cursor: isUploadingPayment[order.order_id] ? 'not-allowed' : 'pointer'}}>
                                {isUploadingPayment[order.order_id] ? '⏳ Mengunggah...' : '📤 Unggah Bukti Transfer'}
                                <input type="file" accept="image/*" style={{display: 'none'}} onChange={(e) => handleFileChange(e, order.order_id)} disabled={isUploadingPayment[order.order_id]} />
                              </label>
                            </div>
                          )}
                          {/* Call Waiter Button (Only for Dine-In) */}
                          {order.nomor_meja && order.nomor_meja.toString().trim() !== '' && (order.status_pesanan !== 'BATAL' && order.status_pesanan !== 'SELESAI') && (
                            <div style={{padding: '16px 20px', background: '#fdf4ff', borderTop: '1px solid #fbcfe8'}}>
                              <button 
                                onClick={() => handleCallWaiter(order)}
                                disabled={isCallingWaiter[order.order_id]}
                                style={{
                                  width: '100%', 
                                  background: isCallingWaiter[order.order_id] ? '#f472b6' : '#ec4899', 
                                  color: 'white', 
                                  border: 'none', 
                                  padding: '12px', 
                                  borderRadius: '8px', 
                                  fontWeight: 'bold', 
                                  cursor: isCallingWaiter[order.order_id] ? 'not-allowed' : 'pointer',
                                  display: 'flex',
                                  justifyContent: 'center',
                                  alignItems: 'center',
                                  gap: '8px',
                                  fontSize: '0.95rem'
                                }}>
                                {isCallingWaiter[order.order_id] ? '⏳ Memanggil...' : '🛎️ Panggil Pelayan'}
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}


            {activeTab === 'merch' && (
              <div style={{ gridColumn: '1 / -1', background: '#ffe4e6', color: '#9f1239', padding: '12px', borderRadius: '8px', textAlign: 'center', marginBottom: '16px', fontSize: '0.9rem' }}>
                ℹ️ Penukaran poin (Redeem) hanya dapat dilakukan langsung di Kasir/Cafe.
              </div>
            )}
            {activeTab !== 'orders' && (activeTab === 'menu' ? (selectedCategory === '' ? [...menuItems].sort((a, b) => (b.terjual_minggu_ini || 0) - (a.terjual_minggu_ini || 0)).slice(0, 20) : menuItems.filter(item => item.kategori === selectedCategory)) : merchItems).map((item) => {
              const cartItems = cart.filter(c => c.id_produk === item.id_produk);
              const totalQty = cartItems.reduce((sum, c) => sum + c.qty, 0);

              // Helper to convert Google Drive URL to direct image URL
              let imageUrl = item.image_url;
              if (imageUrl) {
                let fileId = null;
                if (imageUrl.includes('drive.google.com/file/d/')) {
                  const match = imageUrl.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
                  if (match) fileId = match[1];
                } else if (imageUrl.includes('drive.google.com/uc')) {
                  const match = imageUrl.match(/id=([a-zA-Z0-9_-]+)/);
                  if (match) fileId = match[1];
                }

                if (fileId) {
                  // Gunakan lh3.googleusercontent.com yang dijamin bisa nampil di img tag browser modern
                  imageUrl = `https://lh3.googleusercontent.com/d/${fileId}`;
                }
              }

              return (
                <div key={item.id_produk} className="product-card glass-card" onClick={() => handleProductClick(item)} style={{ cursor: 'pointer' }}>
                  {imageUrl ? (
                    <img src={imageUrl} alt={item.nama_menu} style={{ height: '120px', objectFit: 'cover', width: '100%' }} />
                  ) : (
                    <div className="product-image-placeholder"></div>
                  )}

                  <div className="product-info">
                    <h3>{item.nama_menu}</h3>
                    {activeTab === 'merch' ? (
                      <p className="price" style={{ color: 'var(--primary)' }}>{parseInt(item.harga).toLocaleString('id-ID')} Poin</p>
                    ) : (
                      <p className="price">Rp {parseInt(item.harga).toLocaleString('id-ID')}</p>
                    )}

                    {activeTab === 'menu' && (
                      totalQty > 0 && !item.varian ? (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }} onClick={e => e.stopPropagation()}>
                          <button onClick={() => removeFromCart(cartItems[0].cartItemId)} style={{ width: '32px', height: '32px', borderRadius: '16px', border: '1px solid var(--primary)', background: '#fff', color: 'var(--primary)', fontWeight: 'bold' }}>-</button>
                          <span style={{ fontWeight: 'bold' }}>{totalQty}</span>
                          <button onClick={() => handleProductClick(item)} style={{ width: '32px', height: '32px', borderRadius: '16px', border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 'bold' }}>+</button>
                        </div>
                      ) : totalQty > 0 && item.varian ? (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }} onClick={e => e.stopPropagation()}>
                          <span style={{ fontWeight: 'bold', color: 'var(--primary)', fontSize: '0.9rem' }}>{totalQty} di keranjang</span>
                          <button onClick={() => handleProductClick(item)} style={{ padding: '4px 12px', borderRadius: '16px', border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 'bold', fontSize: '0.8rem' }}>+ Tambah</button>
                        </div>
                      ) : (
                        <button className="add-btn" onClick={(e) => { e.stopPropagation(); handleProductClick(item); }}>+ Tambah</button>
                      )
                    )}
                  </div>
                </div>
              );
            })}

            {activeTab === 'merch' && merchItems.length === 0 && (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '20px' }}>Belum ada merchandise tersedia.</div>
            )}
          </div>
        )}

        {orderType === 'Dine-In' && (
          <div style={{ marginTop: '24px', padding: '12px', background: '#fff', borderRadius: '8px', border: '1px dashed var(--primary)', textAlign: 'center' }}>
            <div style={{ fontSize: '0.9rem', marginBottom: '8px', color: '#334155' }}>Kami siap layanan antar! Siap antar ke rumah Anda.</div>
            <button onClick={() => window.location.href = window.location.pathname} style={{ background: 'var(--primary)', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', width: '100%' }}>🛵 Klik di Sini untuk Pesan Antar</button>
          </div>
        )}
      </main>

      {/* Checkout Screen */}
      <main className="main-content" style={{ display: showCheckout ? 'block' : 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }}>
          <button onClick={() => setShowCheckout(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', marginRight: '16px' }}>←</button>
          <h2 style={{ margin: 0 }}>Keranjang Belanja</h2>
        </div>

        <div className="glass-card" style={{ padding: '16px', marginBottom: '24px' }}>
          <h3 style={{ marginBottom: '16px' }}>Detail Pesanan</h3>
          {cart.map(c => (
            <div key={c.cartItemId} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', borderBottom: '1px solid rgba(0,0,0,0.05)', paddingBottom: '12px' }}>
              <div style={{ flex: 1, paddingRight: '10px' }}>
                <div style={{ fontWeight: 'bold' }}>{c.nama_menu}</div>
                {c.varian_text && <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '2px', fontStyle: 'italic' }}>{c.varian_text}</div>}
                {c.catatan && <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '2px' }}>Catatan: {c.catatan}</div>}
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  <button onClick={() => removeFromCart(c.cartItemId)} style={{ background: 'none', border: '1px solid #ccc', borderRadius: '4px', width: '24px', height: '24px', marginRight: '8px', cursor: 'pointer' }}>-</button>
                  {c.qty}
                  <button onClick={() => addToCart(c, c.varian_text, c.custom_price)} style={{ background: 'none', border: '1px solid #ccc', borderRadius: '4px', width: '24px', height: '24px', marginLeft: '8px', cursor: 'pointer' }}>+</button>
                  <span style={{ marginLeft: '8px' }}>x Rp {(c.custom_price !== undefined ? c.custom_price : c.harga).toLocaleString('id-ID')}</span>
                </div>
              </div>
              <div style={{ fontWeight: 'bold' }}>
                Rp {(c.qty * (c.custom_price !== undefined ? c.custom_price : c.harga)).toLocaleString('id-ID')}
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px', fontSize: '1.2rem', fontWeight: 'bold' }}>
            <span>Total</span>
            <span>Rp {cartTotal.toLocaleString('id-ID')}</span>
          </div>
        </div>

        <div className="glass-card" style={{ padding: '16px', marginBottom: '24px' }}>
          <h3 style={{ marginBottom: '16px' }}>Detail Pemesan</h3>

          <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 'bold' }}>Nama Pemesan</label>
          <input type="text" value={customerName} onChange={e => {setCustomerName(e.target.value); localStorage.setItem('savedCustomerName', e.target.value);}} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ccc', marginBottom: '16px' }} placeholder="Nama Anda" />

          <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 'bold' }}>Nomor HP / WA</label>
          <input type="tel" value={phone} onChange={e => {setPhone(e.target.value); localStorage.setItem('savedPhone', e.target.value);}} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ccc', marginBottom: '16px' }} placeholder="08xx xxxx xxxx" />

          {orderType === 'Dine-In' && (
            <>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 'bold' }}>Nomor Meja</label>
              <input type="text" value={tableNumber} onChange={e => setTableNumber(e.target.value)} readOnly={new URLSearchParams(window.location.search).has('meja')} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ccc', marginBottom: '16px', background: new URLSearchParams(window.location.search).has('meja') ? '#f3f4f6' : '#fff' }} placeholder="Contoh: Meja 12" />
            </>
          )}

          {orderType === 'Delivery' && (
            <>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 'bold' }}>Alamat Lengkap</label>
              <textarea value={address} onChange={e => setAddress(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ccc', marginBottom: '16px', minHeight: '80px' }} placeholder="Alamat Pengiriman..." />

              <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                <button onClick={getGPSLocation} style={{ background: '#10B981', color: '#fff', border: 'none', padding: '10px', borderRadius: '8px', flex: 1, fontWeight: 'bold' }}>📍 Ambil Koordinat GPS (ShareLoc)</button>
              </div>
              {location && <div style={{ fontSize: '0.8rem', color: 'gray', marginBottom: '16px' }}>Koordinat: {location}</div>}
            </>
          )}

          <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 'bold' }}>Metode Pembayaran</label>
          <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ccc', marginBottom: '16px' }}>
            {orderType === 'Dine-In' ? (
              <>
                <option value="Tunai">Tunai</option>
                <option value="QRIS">QRIS</option>
              </>
            ) : (
              <>
                <option value="COD">COD (Bayar di Tempat)</option>
                <option value="Transfer">Transfer Bank</option>
              </>
            )}
          </select>
        </div>

        <button
          onClick={submitOrder}
          disabled={loading}
          style={{ width: '100%', background: 'var(--primary)', color: 'white', border: 'none', padding: '16px', borderRadius: '12px', fontWeight: 'bold', fontSize: '1.1rem', opacity: loading ? 0.7 : 1 }}
        >
          {loading ? 'Memproses...' : 'Kirim Pesanan Sekarang'}
        </button>

      </main>

      {/* Floating Cart Button */}
      {cartItemCount > 0 && !showCheckout && (
        <div className="floating-cart glass-cart">
          <div className="cart-info">
            <span className="cart-count">{cartItemCount} Item</span>
            <span className="cart-total">Rp {cartTotal.toLocaleString('id-ID')}</span>
          </div>
          <button className="checkout-btn" onClick={() => setShowCheckout(true)}>Lihat Keranjang</button>
        </div>
      )}

      {/* Variant Modal */}
      {selectedProductForVariant && (
        <div className="modal-overlay">
          <div className="variant-modal">
            <div className="modal-drag-handle"></div>
            <h2 className="modal-title">{selectedProductForVariant.nama_menu}</h2>

            <div className="modal-scroll-area">
              {selectedProductForVariant.parsedVariants.map((group, gIdx) => (
                <div key={gIdx} className="variant-group">
                  <h3 className="variant-group-title">{group.groupName}</h3>
                  {group.options.map((opt, oIdx) => {
                    if (!group.isMultiple) {
                      const isSelected = variantSelections[group.groupName] === opt.name;
                      return (
                        <div key={oIdx} className={`variant-option ${isSelected ? 'selected' : ''}`} onClick={() => setVariantSelections({ ...variantSelections, [group.groupName]: opt.name })}>
                          <div className="variant-left">
                            <div className={`radio-circle ${isSelected ? 'active' : ''}`}>
                              {isSelected && <div className="radio-inner"></div>}
                            </div>
                            <span className="variant-name">{opt.name} {opt.price > 0 ? `(+Rp ${opt.price.toLocaleString('id-ID')})` : ''}</span>
                          </div>
                        </div>
                      );
                    } else {
                      const qty = (variantSelections[group.groupName] || {})[opt.name] || 0;
                      const isSelected = qty > 0;
                      return (
                        <div key={oIdx} className={`variant-option multiple ${isSelected ? 'selected' : ''}`}>
                          <div className="variant-left" onClick={() => {
                            const currentSel = variantSelections[group.groupName] || {};
                            setVariantSelections({
                              ...variantSelections,
                              [group.groupName]: {
                                ...currentSel,
                                [opt.name]: isSelected ? 0 : 1
                              }
                            });
                          }}>
                            <div className={`checkbox-square ${isSelected ? 'active' : ''}`}>
                              {isSelected && '✓'}
                            </div>
                            <span className="variant-name">{opt.name} {opt.price > 0 ? `(+Rp ${opt.price.toLocaleString('id-ID')})` : ''}</span>
                          </div>
                          {isSelected && (
                            <div className="variant-qty-controls">
                              <button onClick={() => {
                                const currentSel = variantSelections[group.groupName] || {};
                                setVariantSelections({
                                  ...variantSelections,
                                  [group.groupName]: { ...currentSel, [opt.name]: Math.max(0, qty - 1) }
                                });
                              }}>-</button>
                              <span>{qty}</span>
                              <button onClick={() => {
                                const currentSel = variantSelections[group.groupName] || {};
                                setVariantSelections({
                                  ...variantSelections,
                                  [group.groupName]: { ...currentSel, [opt.name]: qty + 1 }
                                });
                              }}>+</button>
                            </div>
                          )}
                        </div>
                      );
                    }
                  })}
                </div>
              ))}

              <div className="variant-group">
                <input
                  type="text"
                  className="variant-notes-input"
                  placeholder="Catatan Tambahan (Opsional)"
                  value={variantNotes}
                  onChange={e => setVariantNotes(e.target.value)}
                />
              </div>
            </div>

            <div className="modal-footer">
              <div className="main-qty-controls">
                <span className="main-qty-label">Jumlah:</span>
                <div className="qty-buttons">
                  <button onClick={() => setVariantQty(Math.max(1, variantQty - 1))}>-</button>
                  <span>{variantQty}</span>
                  <button onClick={() => setVariantQty(variantQty + 1)}>+</button>
                </div>
              </div>

              <button className="submit-variant-btn" onClick={handleVariantSubmit}>
                Tambahkan - Rp {(() => {
                  let extraPrice = 0;
                  selectedProductForVariant.parsedVariants.forEach(group => {
                    if (!group.isMultiple) {
                      const sel = variantSelections[group.groupName];
                      if (sel) {
                        const opt = group.options.find(o => o.name === sel);
                        if (opt) extraPrice += opt.price || 0;
                      }
                    } else {
                      const selObj = variantSelections[group.groupName] || {};
                      const selectedNames = Object.keys(selObj).filter(k => selObj[k] > 0);
                      selectedNames.forEach(name => {
                        const qty = selObj[name];
                        const opt = group.options.find(o => o.name === name);
                        if (opt) extraPrice += (opt.price || 0) * qty;
                      });
                    }
                  });
                  const totalPrice = (parseInt(selectedProductForVariant.harga) + extraPrice) * variantQty;
                  return totalPrice.toLocaleString('id-ID');
                })()}
              </button>
            </div>

            <button className="modal-close-btn" onClick={() => setSelectedProductForVariant(null)}>×</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
