import axios from 'axios'

const baseURL = "http://localhost:3000"

export const api = axios.create({ baseURL })

export const makeFileUrl = (path) => {
  if (!path) return ''
  if (!baseURL) return path
  return new URL(path, baseURL).toString()
}
