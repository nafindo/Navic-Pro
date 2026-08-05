import { useState, useEffect } from 'react'
import { fetchMasterData, fetchMerchandise, checkLoyaltyPoints, createOrder } from './api'
import './index.css'

function App() {
  const [activeTab, setActiveTab] = useState('menu');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [menuItems, setMenuItems] = useState([]);
  const [merchItems, setMerchItems] = useState([]);
  const [cart, setCart] = useState([]);
  const [phone, setPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
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
    const res = await checkLoyaltyPoints(phone);
    if (res.success && res.data) {
      setPoints(res.data.total_poin);
      if (res.data.nama) setCustomerName(res.data.nama);
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
    if (orderType === 'Delivery' && !address) return alert("Mohon masukkan alamat pengiriman!");
    if (cartTotalPoin > 0) {
      if (points === null) return alert("Silakan Cek Poin terlebih dahulu sebelum menukar hadiah!");
      if (points < cartTotalPoin) return alert(`Poin tidak cukup! Poin Anda: ${points}, Butuh: ${cartTotalPoin}`);
    }
    
    setLoading(true);
    const newOrderId = "SELF-" + Date.now().toString().slice(-6);
    
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
      alamat_pengiriman: address,
      koordinat_lokasi: location,
      metode_bayar: paymentMethod,
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
            <img src="/Navic-Pro/crunchy_logo.png" alt="Navic Pro" style={{height: '40px'}} onError={(e)=>{e.target.style.display='none'}} />
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
        <div className="hero-banner" style={{position: 'relative', overflow: 'hidden'}}>
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

          <div style={{position: 'relative', zIndex: 1}}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
              <img src="/Navic-Pro/navic_pro_logo.png" alt="Crunchy Logo" style={{ height: '60px', objectFit: 'contain', filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.2))' }} onError={(e) => e.target.style.display='none'} />
              <h2 style={{fontSize: '2.5rem', fontWeight: '900', color: 'white', margin: 0, letterSpacing: '-1px'}}>Crunchy.co</h2>
            </div>
            <p style={{marginTop: '4px', fontWeight: '500'}}>Hai {customerName ? customerName : 'Pelanggan'}, silakan pilih menu favorit Anda.</p>
            
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
                <div className="category-scroll-container" style={{gridColumn: '1 / -1'}}>
                  {categoryCards.map(cat => (
                    <div 
                      key={cat.name} 
                      className={`category-card ${selectedCategory === cat.name ? 'active' : ''}`}
                      onClick={() => setSelectedCategory(cat.name)}
                    >
                      <img src={cat.image} alt={cat.name} className="category-img" onError={(e)=>{e.target.src='https://cdn-icons-png.flaticon.com/512/3170/3170733.png'}}/>
                      <span className="category-name">{cat.name}</span>
                    </div>
                  ))}
                </div>
              );
            })()}
            {activeTab === 'merch' && (
              <div style={{gridColumn: '1 / -1', background: '#ffe4e6', color: '#9f1239', padding: '12px', borderRadius: '8px', textAlign: 'center', marginBottom: '16px', fontSize: '0.9rem'}}>
                 ℹ️ Penukaran poin (Redeem) hanya dapat dilakukan langsung di Kasir/Cafe.
              </div>
            )}
            {(activeTab === 'menu' ? (selectedCategory === '' ? [...menuItems].sort((a, b) => (b.terjual_minggu_ini || 0) - (a.terjual_minggu_ini || 0)).slice(0, 20) : menuItems.filter(item => item.kategori === selectedCategory)) : merchItems).map((item) => {
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
                <div key={item.id_produk} className="product-card glass-card" onClick={() => handleProductClick(item)} style={{cursor: 'pointer'}}>
                  {imageUrl ? (
                    <img src={imageUrl} alt={item.nama_menu} style={{height: '120px', objectFit: 'cover', width: '100%'}} />
                  ) : (
                    <div className="product-image-placeholder"></div>
                  )}
                  
                  <div className="product-info">
                    <h3>{item.nama_menu}</h3>
                    {activeTab === 'merch' ? (
                       <p className="price" style={{color: 'var(--primary)'}}>{parseInt(item.harga).toLocaleString('id-ID')} Poin</p>
                    ) : (
                       <p className="price">Rp {parseInt(item.harga).toLocaleString('id-ID')}</p>
                    )}
                    
                    {activeTab === 'menu' && (
                      totalQty > 0 && !item.varian ? (
                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto'}} onClick={e => e.stopPropagation()}>
                          <button onClick={() => removeFromCart(cartItems[0].cartItemId)} style={{width: '32px', height: '32px', borderRadius: '16px', border: '1px solid var(--primary)', background: '#fff', color: 'var(--primary)', fontWeight: 'bold'}}>-</button>
                          <span style={{fontWeight: 'bold'}}>{totalQty}</span>
                          <button onClick={() => handleProductClick(item)} style={{width: '32px', height: '32px', borderRadius: '16px', border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 'bold'}}>+</button>
                        </div>
                      ) : totalQty > 0 && item.varian ? (
                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto'}} onClick={e => e.stopPropagation()}>
                          <span style={{fontWeight: 'bold', color: 'var(--primary)', fontSize: '0.9rem'}}>{totalQty} di keranjang</span>
                          <button onClick={() => handleProductClick(item)} style={{padding: '4px 12px', borderRadius: '16px', border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 'bold', fontSize: '0.8rem'}}>+ Tambah</button>
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
               <div style={{gridColumn: '1 / -1', textAlign: 'center', padding: '20px'}}>Belum ada merchandise tersedia.</div>
            )}
          </div>
        )}

        {orderType === 'Dine-In' && (
          <div style={{marginTop: '24px', padding: '12px', background: '#fff', borderRadius: '8px', border: '1px dashed var(--primary)', textAlign: 'center'}}>
            <div style={{fontSize: '0.9rem', marginBottom: '8px', color: '#334155'}}>Kami siap layanan antar! Siap antar ke rumah Anda.</div>
            <button onClick={() => window.location.href = window.location.pathname} style={{background: 'var(--primary)', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', width: '100%'}}>🛵 Klik di Sini untuk Pesan Antar</button>
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
            <div key={c.cartItemId} style={{display: 'flex', justifyContent: 'space-between', marginBottom: '12px', borderBottom: '1px solid rgba(0,0,0,0.05)', paddingBottom: '12px'}}>
              <div style={{flex: 1, paddingRight: '10px'}}>
                <div style={{fontWeight: 'bold'}}>{c.nama_menu}</div>
                {c.varian_text && <div style={{fontSize: '0.75rem', color: '#666', marginTop: '2px', fontStyle: 'italic'}}>{c.varian_text}</div>}
                {c.catatan && <div style={{fontSize: '0.75rem', color: '#666', marginTop: '2px'}}>Catatan: {c.catatan}</div>}
                <div style={{fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px'}}>
                  <button onClick={() => removeFromCart(c.cartItemId)} style={{background: 'none', border: '1px solid #ccc', borderRadius: '4px', width: '24px', height: '24px', marginRight: '8px', cursor: 'pointer'}}>-</button>
                  {c.qty} 
                  <button onClick={() => addToCart(c, c.varian_text, c.custom_price)} style={{background: 'none', border: '1px solid #ccc', borderRadius: '4px', width: '24px', height: '24px', marginLeft: '8px', cursor: 'pointer'}}>+</button>
                  <span style={{marginLeft: '8px'}}>x Rp {(c.custom_price !== undefined ? c.custom_price : c.harga).toLocaleString('id-ID')}</span>
                </div>
              </div>
              <div style={{fontWeight: 'bold'}}>
                 Rp {(c.qty * (c.custom_price !== undefined ? c.custom_price : c.harga)).toLocaleString('id-ID')}
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

           <label style={{display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 'bold'}}>Nomor HP / WA</label>
           <input type="tel" value={phone} onChange={e=>setPhone(e.target.value)} style={{width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ccc', marginBottom: '16px'}} placeholder="08xx xxxx xxxx" />

           {orderType === 'Dine-In' && (
             <>
               <label style={{display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 'bold'}}>Nomor Meja</label>
               <input type="text" value={tableNumber} onChange={e=>setTableNumber(e.target.value)} readOnly={new URLSearchParams(window.location.search).has('meja')} style={{width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ccc', marginBottom: '16px', background: new URLSearchParams(window.location.search).has('meja') ? '#f3f4f6' : '#fff'}} placeholder="Contoh: Meja 12" />
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
             <option value="Tunai">Tunai</option>
             <option value="QRIS">QRIS</option>
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
                        <div key={oIdx} className={`variant-option ${isSelected ? 'selected' : ''}`} onClick={() => setVariantSelections({...variantSelections, [group.groupName]: opt.name})}>
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
