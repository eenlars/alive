import { FilesystemStorage } from "@alive-brug/images"
import { PATHS } from "@webalive/shared"

export const imageStorage = new FilesystemStorage({
  basePath: process.env.IMAGES_STORAGE_PATH || PATHS.IMAGES_STORAGE,
  signatureSecret: process.env.IMAGES_SIGNATURE_SECRET,
})
