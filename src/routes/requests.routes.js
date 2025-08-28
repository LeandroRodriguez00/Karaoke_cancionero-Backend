import { Router } from 'express'
import { createRequest } from '../controllers/requests.controller.js'

const router = Router()

// Público: no requiere admin key
router.post('/', createRequest)

export default router
