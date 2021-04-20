import { TPromise, UploadFile } from '../../interface'

export const fileReader = (uploadfile: UploadFile, start?: number, end?: number): TPromise<Blob> => {
  return new Promise((resolve, reject) => {
    let raw: Nullable<Blob> = uploadfile.raw
    start = start || 0
    end = end || uploadfile.size
    if (raw instanceof Blob) {
      let blob: Blob = raw.slice(start, end)
      resolve(blob)
    } else {
      // TODO
      throw new Error()
    }
  })
}
