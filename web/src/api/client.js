import axios from 'axios'

const baseURL = import.meta.env.VITE_API_URL || ''

export const api = axios.create({ baseURL })

export const makeFileUrl = (path) => {
  if (!path) return ''
  if (!baseURL) return path
  return new URL(path, baseURL).toString()
}
