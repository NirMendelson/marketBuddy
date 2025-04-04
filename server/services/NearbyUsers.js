const { supabase } = require('../config/db');

const haversineDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // meters
  const toRad = (deg) => deg * (Math.PI / 180);

  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lon2 - lon1);

  const a = Math.sin(Δφ / 2) ** 2 +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

exports.findNearbyUsers = async (userEmail) => {
  try {
    // Get current user's coordinates
    const { data: currentUser, error: currentError } = await supabase
      .from('user_coordinates')
      .select('latitude, longitude')
      .eq('email', userEmail)
      .single();

    if (currentError || !currentUser) {
      throw new Error("User location not found.");
    }

    // Get all other users' coordinates
    const { data: others, error: othersError } = await supabase
      .from('user_coordinates')
      .select('email, latitude, longitude')
      .neq('email', userEmail);

    if (othersError) throw othersError;

    // Check distance to each user
    const nearby = others.filter(user => {
      const distance = haversineDistance(
        currentUser.latitude,
        currentUser.longitude,
        user.latitude,
        user.longitude
      );
      return distance <= 300;
    }).map(user => ({
      ...user,
      distance: Math.round(haversineDistance(
        currentUser.latitude,
        currentUser.longitude,
        user.latitude,
        user.longitude
      ))
    }));

    console.log("🧭 Nearby users within 300m:", nearby);
    return nearby;
  } catch (error) {
    console.error("Error finding nearby users:", error);
    return [];
  }
};
