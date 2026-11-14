// Configuración pública del frontend. La anon/publishable key está diseñada para el cliente;
// la seguridad real se aplica con RLS en Supabase. NUNCA colocar aquí la service_role key.
export const CONFIG = {
  supabaseUrl: '',       // Ej.: https://TU-PROYECTO.supabase.co
  supabaseAnonKey: '',   // Clave anon/publishable del proyecto
  // Para cartografía histórica: URL de teselas XYZ ({z}/{x}/{y}) o servicio compatible.
  historicalTilesUrl: '',
  historicalAttribution: 'Cartografía histórica georreferenciada · fuente por completar'
};
