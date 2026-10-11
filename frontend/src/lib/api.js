import axios from 'axios'

// Si VITE_API_URL no está definida, el backend se asume en el mismo host que sirve la app,
// puerto 8000. Así funciona igual desde localhost y desde la IP de la red local (teléfono).
const API_URL =
  import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:8000/api`

export const api = axios.create({ baseURL: API_URL })

/** Origen del backend (para archivos /media/...). */
export const backendOrigin = () => new URL(api.defaults.baseURL, window.location.href).origin

const ACCESS = 'luz_access'
const REFRESH = 'luz_refresh'

export const getToken = () => localStorage.getItem(ACCESS)
export const isLoggedIn = () => Boolean(getToken())

export function logout() {
  localStorage.removeItem(ACCESS)
  localStorage.removeItem(REFRESH)
}

export async function login(username, password) {
  const { data } = await api.post('/auth/token/', { username, password })
  localStorage.setItem(ACCESS, data.access)
  localStorage.setItem(REFRESH, data.refresh)
}

api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

let refreshing = null
api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config
    const refresh = localStorage.getItem(REFRESH)
    if (error.response?.status === 401 && refresh && !original._retry) {
      original._retry = true
      refreshing ??= axios
        .post(`${api.defaults.baseURL}/auth/refresh/`, { refresh })
        .finally(() => {
          refreshing = null
        })
      try {
        const { data } = await refreshing
        localStorage.setItem(ACCESS, data.access)
        return api(original)
      } catch {
        logout()
        window.location.assign('/login')
      }
    }
    return Promise.reject(error)
  },
)

/** Lista un endpoint DRF recorriendo todas las páginas (máx. 20). */
export async function listar(path, params) {
  const resultados = []
  let url = path
  let query = params
  for (let i = 0; i < 20 && url; i++) {
    const { data } = await api.get(url, { params: query })
    if (Array.isArray(data)) return data
    resultados.push(...(data.results ?? []))
    url = data.next
    query = undefined
  }
  return resultados
}

export const obtenerPerfil = () => api.get('/auth/me/').then((r) => r.data)
