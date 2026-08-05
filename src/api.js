const BASE_URL = 'https://script.google.com/macros/s/AKfycbzPPFYAXX5n0oJxRjI6zPQzikIneXaaTqskCA9dKacbTtLeaW0ZUVy2K2waRIiqGoLp/exec';

export const apiCall = async (action, payload = {}) => {
  try {
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify({ action, payload }),
      redirect: 'follow'
    });
    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`Error calling ${action}:`, error);
    return { success: false, message: error.message };
  }
};

export const fetchMasterData = async () => {
  return apiCall('SYNC_MASTER_DATA');
};

export const fetchMerchandise = async () => {
  return apiCall('SYNC_MERCHANDISE');
};

export const checkLoyaltyPoints = async (phone) => {
  return apiCall('CHECK_POIN', { no_hp: phone });
};

export const createOrder = async (orderData) => {
  return apiCall('CREATE_SELF_ORDER', orderData);
};

export const checkOrderStatus = async (orderId) => {
  return apiCall('CHECK_ORDER_STATUS', { order_id: orderId });
};

export const checkOrdersByPhone = async (phone) => {
  return apiCall('CHECK_ORDERS_BY_PHONE', { no_hp: phone });
};
