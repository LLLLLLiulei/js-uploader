import { TPromise, UploadFile } from '../../interface'

export const fileReader = (uploadfile: UploadFile, start?: number, end?: number): TPromise<Blob> => {
  return new Promise((resolve, reject) => {
    let raw: Nullable<Blob> = uploadfile.raw
    if (!raw) {
      return reject(new Error('no raw!'))
    }
    start = start || 0
    end = end || uploadfile.size
    let blob: Blob = raw.slice(start, end)
    resolve(blob)
  })
}
