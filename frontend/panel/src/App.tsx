import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { ProtectedRoute } from '@/components/layouts/ProtectedRoute'
import { VisitasPage } from '@/features/visitas/VisitasPage'
import { LoginPage } from '@/pages/LoginPage'

function App() {
  return (
    <BrowserRouter basename="/panel-react">
      <Routes>
        <Route path="/auth/login" element={<LoginPage />} />
        <Route
          path="/visitas"
          element={
            <ProtectedRoute>
              <VisitasPage />
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<Navigate to="/visitas" replace />} />
        <Route path="*" element={<Navigate to="/visitas" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
