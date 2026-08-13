export function calculateDiscount(items, isDelivery, inputVoucherCode, activePromos) {
    if (!activePromos || activePromos.length === 0) {
        return { finalSubtotal: getSubtotal(items), totalDiscountRp: 0, appliedPromos: [], freeDeliveryActive: false };
    }

    let subtotal = getSubtotal(items);
    let totalDiscountRp = 0;
    let appliedPromos = [];
    let freeDeliveryActive = false;

    const today = new Date();
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const currentDayStr = days[today.getDay()];
    const currentHourStr = today.toTimeString().substring(0, 5); // e.g. "14:30"

    function isTimeValid(promo) {
        if (!promo.jam_mulai || !promo.jam_selesai) return true;
        return currentHourStr >= promo.jam_mulai && currentHourStr <= promo.jam_selesai;
    }

    function isDayValid(promo) {
        if (!promo.hari_berlaku || promo.hari_berlaku === "Semua Hari") return true;
        return promo.hari_berlaku.includes(currentDayStr);
    }

    const targetPlatformFilter = isDelivery ? "Web Delivery" : "Web Dine-In";

    function isPlatformValid(promo) {
        if (!promo.target_platform || promo.target_platform === "Semua") return true;
        return promo.target_platform === targetPlatformFilter;
    }

    let activeVoucherPromo = null;
    if (inputVoucherCode) {
        activeVoucherPromo = activePromos.find(p => 
            p.tipe === "Voucher" && 
            p.kode_voucher?.toLowerCase() === inputVoucherCode.toLowerCase() && 
            p.is_active && isPlatformValid(p)
        );
    }

    // SCENARIO 4: Jika ada voucher valid, abaikan Auto Promo
    if (activeVoucherPromo && isTimeValid(activeVoucherPromo) && isDayValid(activeVoucherPromo)) {
        if (subtotal >= (activeVoucherPromo.min_order_rp || 0)) {
            let discount = Math.floor(subtotal * ((activeVoucherPromo.discount_percent || 0) / 100.0));
            if (activeVoucherPromo.discount_max_rp > 0 && discount > activeVoucherPromo.discount_max_rp) {
                discount = activeVoucherPromo.discount_max_rp;
            }
            if (discount > 0) {
                totalDiscountRp += discount;
                appliedPromos.push(activeVoucherPromo);
            }
        }
    } else {
        // Terapkan Auto Promos jika tidak ada Voucher
        const autoPromos = activePromos.filter(p => (p.tipe === "Auto" || p.tipe === "HappyHour") && p.is_active && isPlatformValid(p));
        for (let p of autoPromos) {
            if (isTimeValid(p) && isDayValid(p)) {
                if (subtotal >= (p.min_order_rp || 0)) {
                    let discount = Math.floor(subtotal * ((p.discount_percent || 0) / 100.0));
                    if (p.discount_max_rp > 0 && discount > p.discount_max_rp) {
                        discount = p.discount_max_rp;
                    }
                    if (discount > 0) {
                        totalDiscountRp += discount;
                        appliedPromos.push(p);
                    }
                }
            }
        }
    }

    // Terapkan Free Delivery (bisa digabung dengan Voucher/Auto)
    if (isDelivery) {
        const freeDelPromo = activePromos.find(p => p.tipe === "FreeDelivery" && p.is_active && isPlatformValid(p));
        if (freeDelPromo && isTimeValid(freeDelPromo) && isDayValid(freeDelPromo)) {
            if (subtotal >= (freeDelPromo.min_order_rp || 0)) {
                freeDeliveryActive = true;
                appliedPromos.push(freeDelPromo);
            }
        }
    }

    return {
        finalSubtotal: Math.max(0, subtotal - totalDiscountRp),
        totalDiscountRp: totalDiscountRp,
        appliedPromos: appliedPromos,
        freeDeliveryActive: freeDeliveryActive
    };
}

function getSubtotal(items) {
    return items.reduce((sum, item) => sum + ((item.custom_price !== undefined ? item.custom_price : (item.harga || 0)) * (item.qty || 1)), 0);
}
