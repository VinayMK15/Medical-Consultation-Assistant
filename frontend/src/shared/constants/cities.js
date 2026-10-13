// Shared geographic constants — import from here, never hardcode in components

export const INDIA_CENTER   = [20.5937, 78.9629];
export const INDIA_MIN_ZOOM = 5;
export const INDIA_MAX_ZOOM = 16;
export const INDIA_BOUNDS   = [
  [6.4627,  68.1097],   // Southwest — near Kanyakumari/Gujarat
  [35.5133, 97.3953],   // Northeast — near Kashmir/Arunachal
];

export const CITY_COORDS = {
  Bangalore:  [12.9716, 77.5946],
  Mumbai:     [19.0760, 72.8777],
  Delhi:      [28.6139, 77.2090],
  Chennai:    [13.0827, 80.2707],
  Hyderabad:  [17.3850, 78.4867],
  Pune:       [18.5204, 73.8567],
  Kolkata:    [22.5726, 88.3639],
};

export const CITY_AREA_COORDS = {
  // Cities
  Bangalore:  [12.9716, 77.5946],
  Mumbai:     [19.0760, 72.8777],
  Delhi:      [28.6139, 77.2090],
  Chennai:    [13.0827, 80.2707],
  Hyderabad:  [17.3850, 78.4867],
  Pune:       [18.5204, 73.8567],
  Kolkata:    [22.5726, 88.3639],

  // Bangalore areas
  Koramangala:       [12.9352, 77.6245],
  Indiranagar:       [12.9784, 77.6408],
  Jayanagar:         [12.9308, 77.5838],
  Whitefield:        [12.9698, 77.7500],
  Rajajinagar:       [12.9907, 77.5530],
  Banashankari:      [12.9255, 77.5468],
  Hebbal:            [13.0354, 77.5972],
  Kengeri:           [12.8996, 77.4827],
  Marathahalli:      [12.9591, 77.6974],
  'BTM Layout':      [12.9166, 77.6101],
  'HSR Layout':      [12.9116, 77.6389],
  'Electronic City': [12.8399, 77.6770],
  Malleswaram:       [12.9997, 77.5713],
  Bellandur:         [12.9263, 77.6756],
  'JP Nagar':        [12.9082, 77.5858],
  Yelahanka:         [13.1007, 77.5963],

  // Mumbai areas
  Bandra:            [19.0596, 72.8295],
  Andheri:           [19.1136, 72.8697],
  Worli:             [19.0176, 72.8172],
  Dadar:             [19.0178, 72.8478],
  Powai:             [19.1176, 72.9060],
  Juhu:              [19.1075, 72.8263],
  Malad:             [19.1874, 72.8484],
  Vashi:             [19.0770, 72.9986],
};
