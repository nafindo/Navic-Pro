import { useState, useEffect } from 'react'
import { fetchMasterData, checkLoyaltyPoints, createOrder } from './api'
import './index.css'

function App() {
  const [activeTab, setActiveTab] = useState('menu');
  const [menuItems, setMenuItems] = useState([]);
  const [merchItems, setMerchItems] = useState([]); // if merch is in products or separate
  const [cart, setCart] = useState([]);
  const [phone, setPhone] = useState('');
  const [points, setPoints] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const res = await fetchMasterData();
    if (res.success && res.data && res.data.produk) {
      // For now, assuming all products are menu items. 
      // If merch is a specific category, we can filter it. 
      // Let's assume Category "Merchandise" is for points
      const allProducts = res.data.produk.filter(p => p.is_tersedia);
      setMenuItems(allProducts.filter(p => p.kategori !== "Merchandise"));
      setMerchItems(allProducts.filter(p => p.kategori === "Merchandise"));
    }
    setLoading(false);
  };

  const handleCheckPoints = async () => {
    if (phone.length < 9) return;
    const res = await checkLoyaltyPoints(phone);
    if (res.success && res.data) {
      setPoints(res.data.poin);
    } else {
      setPoints(0); // not found or no points
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

  const cartTotal = cart.reduce((sum, item) => sum + ((item.harga || 0) * item.qty), 0);
  const cartItemCount = cart.reduce((sum, item) => sum + item.qty, 0);

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
      <main className="main-content">
        <div className="hero-banner">
          <h2>Selamat Datang!</h2>
          <p>Silakan pilih menu favorit Anda.</p>
          
          <div style={{marginTop: '15px', display: 'flex', gap: '10px'}}>
             <input 
               type="tel" 
               placeholder="Masukkan No HP / WA" 
               value={phone} 
               onChange={(e) => setPhone(e.target.value)}
               style={{padding: '8px', borderRadius: '8px', border: '1px solid #ccc', flex: 1}}
             />
             <button onClick={handleCheckPoints} style={{background: '#4F46E5', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 12px'}}>Cek Poin</button>
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
        ) : (
          <div className="products-grid">
            {(activeTab === 'menu' ? menuItems : merchItems).map((item) => (
              <div key={item.id_produk} className="product-card glass-card">
                {item.image_url ? (
                  <img src={item.image_url} alt={item.nama_menu} style={{height: '120px', objectFit: 'cover', width: '100%'}} />
                ) : (
                  <div className="product-image-placeholder"></div>
                )}
                
                <div className="product-info">
                  <h3>{item.nama_menu}</h3>
                  <p className="price">Rp {parseInt(item.harga).toLocaleString('id-ID')}</p>
                  <button className="add-btn" onClick={() => addToCart(item)}>+ Tambah</button>
                </div>
              </div>
            ))}
            
            {activeTab === 'merch' && merchItems.length === 0 && (
               <div style={{gridColumn: '1 / -1', textAlign: 'center', padding: '20px'}}>Belum ada merchandise tersedia.</div>
            )}
          </div>
        )}
      </main>

      {/* Floating Cart Button */}
      {cartItemCount > 0 && (
        <div className="floating-cart glass-cart">
          <div className="cart-info">
            <span className="cart-count">{cartItemCount} Item</span>
            <span className="cart-total">Rp {cartTotal.toLocaleString('id-ID')}</span>
          </div>
          <button className="checkout-btn">Checkout</button>
        </div>
      )}
    </div>
  )
}

export default App
