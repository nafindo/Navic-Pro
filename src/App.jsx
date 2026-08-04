import { useState, useEffect } from 'react'
import { fetchMasterData, checkLoyaltyPoints, createOrder } from './api'
import './index.css'

function App() {
  const [activeTab, setActiveTab] = useState('menu');
  const [menuItems, setMenuItems] = useState([]);
  const [merchItems, setMerchItems] = useState([]);
  const [cart, setCart] = useState([]);
  const [phone, setPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [points, setPoints] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  // Checkout State
  const [showCheckout, setShowCheckout] = useState(false);
  const [orderType, setOrderType] = useState('Dine-In'); // Dine-In or Delivery
  const [tableNumber, setTableNumber] = useState('');
  const [address, setAddress] = useState('');
  const [location, setLocation] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Tunai'); // Tunai or Transfer
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [orderId, setOrderId] = useState('');

  useEffect(() => {
    // Auto detect table from URL if any
    const params = new URLSearchParams(window.location.search);
    const mejaUrl = params.get('meja');
    if (mejaUrl) {
      setTableNumber(mejaUrl);
      setOrderType('Dine-In');
    }
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetchMasterData();
      if (res.success && res.data && res.data.produk) {
        const allProducts = res.data.produk.filter(p => p.is_tersedia);
        setMenuItems(allProducts.filter(p => p.kategori !== "Merchandise"));
        setMerchItems(allProducts.filter(p => p.kategori === "Merchandise"));
      } else {
        setErrorMsg("Gagal memuat data menu dari server.");
      }
    } catch (e) {
      setErrorMsg("Koneksi error: " + e.message);
    }
    setLoading(false);
  };

  const handleCheckPoints = async () => {
    if (phone.length < 9) return;
    const res = await checkLoyaltyPoints(phone);
    if (res.success && res.data) {
      setPoints(res.data.poin);
      if (res.data.nama_pelanggan) setCustomerName(res.data.nama_pelanggan);
    } else {
      setPoints(0);
    }
  };

  const addToCart = (item) => {
    const existing = cart.find(c => c.id_produk === item.id_produk);
    if (existing) {
      setCart(cart.map(c => c.id_produk === item.id_produk ? { ...c, qty: c.qty + 1 } : c));
    } else {
      setCart([...cart, { ...item, qty: 1 }]);
    }
  };

  const removeFromCart = (id) => {
    const existing = cart.find(c => c.id_produk === id);
    if (existing.qty > 1) {
      setCart(cart.map(c => c.id_produk === id ? { ...c, qty: c.qty - 1 } : c));
    } else {
      setCart(cart.filter(c => c.id_produk !== id));
    }
  };

  const cartTotal = cart.reduce((sum, item) => sum + ((item.harga || 0) * item.qty), 0);
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
    if (orderType === 'Delivery' && !address) return alert("Mohon masukkan alamat pengiriman!");
    
    setLoading(true);
    const newOrderId = "SELF-" + Date.now().toString().slice(-6);
    
    // Convert cart items to matching format
    const items = cart.map(c => ({
      id_produk: c.id_produk,
      nama_produk: c.nama_menu,
      harga_satuan: c.harga,
      quantity: c.qty,
      notes: "",
      subtotal: c.harga * c.qty
    }));

    const payload = {
      order_id: newOrderId,
      nama_pelanggan: customerName,
      no_hp_pelanggan: phone,
      jenis_pesanan: orderType,
      nomor_meja: orderType === 'Dine-In' ? tableNumber : '',
      alamat_pengiriman: address,
      koordinat_lokasi: location,
      metode_bayar: paymentMethod,
      items: items,
      subtotal: cartTotal,
      pajak_ppn: 0,
      diskon: 0,
      total_bayar: cartTotal,
      poin_didapat: Math.floor(cartTotal / 10000), // contoh: 1 poin per 10rb
      poin_ditukar: 0
    };

    const res = await createOrder(payload);
    if (res.success) {
      setOrderId(newOrderId);
      setOrderSuccess(true);
      setCart([]);
    } else {
      alert("Gagal memproses pesanan: " + res.message);
    }
    setLoading(false);
  };

  if (orderSuccess) {
    return (
      <div className="app-container" style={{display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '20px', textAlign: 'center'}}>
        <div className="glass-card" style={{padding: '40px', width: '100%'}}>
          <h2 style={{color: '#10B981', fontSize: '3rem', marginBottom: '16px'}}>✓</h2>
          <h2>Pesanan Berhasil Dibuat!</h2>
          <p style={{margin: '16px 0'}}>Order ID: <b>{orderId}</b></p>
          <p style={{color: 'var(--text-muted)', marginBottom: '24px'}}>
            {orderType === 'Delivery' 
              ? "Pesanan Anda sedang dikonfirmasi. Mohon tunggu informasi ongkir dari Kasir." 
              : "Silakan tunggu di meja Anda, pesanan akan segera dihidangkan."}
          </p>
          <button className="add-btn" style={{width: '100%'}} onClick={() => {setOrderSuccess(false); setShowCheckout(false);}}>Kembali ke Menu</button>
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
            <img src="/Navic-Pro/navic_pro_logo.png" alt="Navic Pro" style={{height: '40px'}} onError={(e)=>{e.target.src='./navic_pro_logo.png'}} />
            <h1>Navic Pro</h1>
          </div>
          <div className="loyalty-badge">
            <span className="pts-label">Poin Anda:</span>
            <span className="pts-value">{points !== null ? `${points} Pts` : 'Login'}</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content" style={{ display: showCheckout ? 'none' : 'block' }}>
        <div className="hero-banner">
          <h2>Hai, {customerName || 'Pelanggan'}!</h2>
          <p>Silakan pilih menu favorit Anda.</p>
          
          <div style={{marginTop: '15px', display: 'flex', gap: '10px'}}>
             <input 
               type="tel" 
               placeholder="Masukkan No HP / WA" 
               value={phone} 
               onChange={(e) => setPhone(e.target.value)}
               style={{padding: '8px', borderRadius: '8px', border: '1px solid #ccc', flex: 1}}
             />
             <button onClick={handleCheckPoints} style={{background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 12px'}}>Cek Poin</button>
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
            Tukar Poin (Hadiah)
          </button>
        </div>

        {/* Products Grid */}
        {loading ? (
           <div style={{textAlign: 'center', padding: '40px'}}>Memuat Data...</div>
        ) : errorMsg ? (
           <div style={{textAlign: 'center', padding: '40px', color: 'red'}}>
              {errorMsg}
              <br/><br/>
              <button onClick={loadData} style={{padding: '8px 16px', borderRadius: '8px', border: 'none', background: 'var(--primary)', color: '#fff'}}>Coba Lagi</button>
           </div>
        ) : (
          <div className="products-grid">
            {(activeTab === 'menu' ? menuItems : merchItems).map((item) => {
               const cartItem = cart.find(c => c.id_produk === item.id_produk);
               
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
                <div key={item.id_produk} className="product-card glass-card">
                  {imageUrl ? (
                    <img src={imageUrl} alt={item.nama_menu} style={{height: '120px', objectFit: 'cover', width: '100%'}} />
                  ) : (
                    <div className="product-image-placeholder"></div>
                  )}
                  
                  <div className="product-info">
                    <h3>{item.nama_menu}</h3>
                    <p className="price">Rp {parseInt(item.harga).toLocaleString('id-ID')}</p>
                    
                    {cartItem ? (
                      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto'}}>
                        <button onClick={() => removeFromCart(item.id_produk)} style={{width: '32px', height: '32px', borderRadius: '16px', border: '1px solid var(--primary)', background: '#fff', color: 'var(--primary)', fontWeight: 'bold'}}>-</button>
                        <span style={{fontWeight: 'bold'}}>{cartItem.qty}</span>
                        <button onClick={() => addToCart(item)} style={{width: '32px', height: '32px', borderRadius: '16px', border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 'bold'}}>+</button>
                      </div>
                    ) : (
                      <button className="add-btn" onClick={() => addToCart(item)}>+ Tambah</button>
                    )}
                  </div>
                </div>
               );
            })}
            
            {activeTab === 'merch' && merchItems.length === 0 && (
               <div style={{gridColumn: '1 / -1', textAlign: 'center', padding: '20px'}}>Belum ada merchandise tersedia.</div>
            )}
          </div>
        )}
      </main>

      {/* Checkout Screen */}
      <main className="main-content" style={{ display: showCheckout ? 'block' : 'none' }}>
        <div style={{display: 'flex', alignItems: 'center', marginBottom: '20px'}}>
           <button onClick={() => setShowCheckout(false)} style={{background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', marginRight: '16px'}}>←</button>
           <h2 style={{margin: 0}}>Keranjang Belanja</h2>
        </div>

        <div className="glass-card" style={{padding: '16px', marginBottom: '24px'}}>
          {cart.map(c => (
            <div key={c.id_produk} style={{display: 'flex', justifyContent: 'space-between', marginBottom: '12px', borderBottom: '1px solid rgba(0,0,0,0.05)', paddingBottom: '12px'}}>
              <div>
                <div style={{fontWeight: 'bold'}}>{c.nama_menu}</div>
                <div style={{fontSize: '0.85rem', color: 'var(--text-muted)'}}>{c.qty} x Rp {parseInt(c.harga).toLocaleString('id-ID')}</div>
              </div>
              <div style={{fontWeight: 'bold'}}>
                 Rp {(c.qty * c.harga).toLocaleString('id-ID')}
              </div>
            </div>
          ))}
          <div style={{display: 'flex', justifyContent: 'space-between', marginTop: '16px', fontSize: '1.2rem', fontWeight: 'bold'}}>
             <span>Total</span>
             <span>Rp {cartTotal.toLocaleString('id-ID')}</span>
          </div>
        </div>

        <div className="glass-card" style={{padding: '16px', marginBottom: '24px'}}>
           <h3 style={{marginBottom: '16px'}}>Detail Pesanan</h3>
           
           <label style={{display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 'bold'}}>Nama Pemesan</label>
           <input type="text" value={customerName} onChange={e=>setCustomerName(e.target.value)} style={{width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ccc', marginBottom: '16px'}} placeholder="Nama Anda" />

           <label style={{display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 'bold'}}>Tipe Pesanan</label>
           <div style={{display: 'flex', gap: '10px', marginBottom: '16px'}}>
              <button 
                 onClick={() => setOrderType('Dine-In')} 
                 style={{flex: 1, padding: '12px', borderRadius: '8px', border: orderType === 'Dine-In' ? '2px solid var(--primary)' : '1px solid #ccc', background: orderType === 'Dine-In' ? '#eef2ff' : '#fff', fontWeight: 'bold'}}
              >Dine-In</button>
              <button 
                 onClick={() => setOrderType('Delivery')} 
                 style={{flex: 1, padding: '12px', borderRadius: '8px', border: orderType === 'Delivery' ? '2px solid var(--primary)' : '1px solid #ccc', background: orderType === 'Delivery' ? '#eef2ff' : '#fff', fontWeight: 'bold'}}
              >Delivery</button>
           </div>

           {orderType === 'Dine-In' && (
             <>
               <label style={{display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 'bold'}}>Nomor Meja</label>
               <input type="text" value={tableNumber} onChange={e=>setTableNumber(e.target.value)} style={{width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ccc', marginBottom: '16px'}} placeholder="Contoh: Meja 12" />
             </>
           )}

           {orderType === 'Delivery' && (
             <>
               <label style={{display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 'bold'}}>Alamat Lengkap</label>
               <textarea value={address} onChange={e=>setAddress(e.target.value)} style={{width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ccc', marginBottom: '16px', minHeight: '80px'}} placeholder="Alamat Pengiriman..." />
               
               <div style={{display: 'flex', gap: '10px', marginBottom: '16px'}}>
                 <button onClick={getGPSLocation} style={{background: '#10B981', color: '#fff', border: 'none', padding: '10px', borderRadius: '8px', flex: 1, fontWeight: 'bold'}}>📍 Ambil Koordinat GPS (ShareLoc)</button>
               </div>
               {location && <div style={{fontSize: '0.8rem', color: 'gray', marginBottom: '16px'}}>Koordinat: {location}</div>}
             </>
           )}

           <label style={{display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 'bold'}}>Metode Pembayaran</label>
           <select value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value)} style={{width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ccc', marginBottom: '16px'}}>
             <option value="Tunai">Tunai / Bayar di Tempat (COD)</option>
             <option value="Transfer">Transfer Bank / QRIS (Selesaikan dengan Kasir)</option>
           </select>
        </div>

        <button 
          onClick={submitOrder} 
          disabled={loading}
          style={{width: '100%', background: 'var(--primary)', color: 'white', border: 'none', padding: '16px', borderRadius: '12px', fontWeight: 'bold', fontSize: '1.1rem', opacity: loading ? 0.7 : 1}}
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
    </div>
  )
}

export default App
