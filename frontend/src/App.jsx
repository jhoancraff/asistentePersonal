import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import BottomNav from './components/BottomNav'
import Header from './components/Header'
import { isLoggedIn } from './lib/api'
import Agenda from './pages/Agenda'
import AgregarTarjeta from './pages/AgregarTarjeta'
import Chat from './pages/Chat'
import CuentaDetalle from './pages/CuentaDetalle'
import Cuentas from './pages/Cuentas'
import Finanzas from './pages/Finanzas'
import Inicio from './pages/Inicio'
import Login from './pages/Login'
import Notas from './pages/Notas'
import TarjetasDeCuenta from './pages/TarjetasDeCuenta'

function Layout() {
  const { pathname } = useLocation()
  if (!isLoggedIn()) return <Navigate to="/login" replace />
  return (
    <div className={pathname === '/chat' ? 'app app-chat' : 'app'}>
      <Header />
      <main className="content">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Layout />}>
        <Route index element={<Inicio />} />
        <Route path="finanzas" element={<Finanzas />} />
        <Route path="finanzas/cuentas" element={<Cuentas />} />
        <Route path="finanzas/cuentas/:id" element={<CuentaDetalle />} />
        <Route path="finanzas/cuentas/:id/tarjetas" element={<TarjetasDeCuenta />} />
        <Route path="finanzas/nueva" element={<AgregarTarjeta />} />
        <Route path="finanzas/:id/editar" element={<AgregarTarjeta />} />
        <Route path="agenda" element={<Agenda />} />
        <Route path="notas" element={<Notas />} />
        <Route path="chat" element={<Chat />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
