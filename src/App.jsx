import { useState } from 'react'
import './index.css'

function App() {
  const [activeTab, setActiveTab] = useState('menu');

  return (
    <div className="app-container">
      {/* Header */}
      <header className="glass-header">
        <div className="header-content">
          <div className="logo-section">
            <div className="logo-circle">NP</div>
            <h1>Navic Pro</h1>
          </div>
          <div className="loyalty-badge">
            <span className="pts-label">Poin Anda:</span>
            <span className="pts-value">Login</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content">
        <div className="hero-banner">
          <h2>Selamat Datang!</h2>
          <p>Silakan pilih menu favorit Anda.</p>
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

        {/* Dummy Products Grid */}
        <div className="products-grid">
          {[1, 2, 3, 4, 5, 6].map((item) => (
            <div key={item} className="product-card glass-card">
              <div className="product-image-placeholder"></div>
              <div className="product-info">
                <h3>Menu Lezat {item}</h3>
                <p className="price">Rp {25000 + (item * 5000)}</p>
                <button className="add-btn">+ Tambah</button>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Floating Cart Button */}
      <div className="floating-cart glass-cart">
        <div className="cart-info">
          <span className="cart-count">0 Item</span>
          <span className="cart-total">Rp 0</span>
        </div>
        <button className="checkout-btn">Lihat Keranjang</button>
      </div>
    </div>
  )
}

export default App
