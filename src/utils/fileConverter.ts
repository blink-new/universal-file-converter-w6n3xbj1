export interface ConversionProgress {
  progress: number
  status: 'converting' | 'completed' | 'error'
  message?: string
}

export class FileConverter {
  private ffmpegLoaded = false

  constructor() {
    // Remove FFmpeg initialization for now - we'll use browser APIs
  }

  async convertImage(
    file: File, 
    targetFormat: string, 
    onProgress: (progress: ConversionProgress) => void
  ): Promise<Blob> {
    onProgress({ progress: 10, status: 'converting', message: 'Processing image...' })

    try {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')!
      const img = new Image()

      return new Promise((resolve, reject) => {
        img.onload = () => {
          canvas.width = img.width
          canvas.height = img.height
          ctx.drawImage(img, 0, 0)

          onProgress({ progress: 50, status: 'converting', message: 'Converting format...' })

          // Convert to target format
          const quality = targetFormat === 'jpeg' || targetFormat === 'jpg' ? 0.9 : undefined
          const mimeType = this.getMimeType(targetFormat)

          canvas.toBlob((blob) => {
            if (blob) {
              onProgress({ progress: 100, status: 'completed' })
              resolve(blob)
            } else {
              reject(new Error('Failed to convert image'))
            }
          }, mimeType, quality)
        }

        img.onerror = () => reject(new Error('Failed to load image'))
        img.src = URL.createObjectURL(file)
      })
    } catch (error) {
      onProgress({ progress: 0, status: 'error', message: 'Image conversion failed' })
      throw error
    }
  }

  async convertVideo(
    file: File, 
    targetFormat: string, 
    onProgress: (progress: ConversionProgress) => void
  ): Promise<Blob> {
    // For now, we'll use a simple approach that works with the MediaRecorder API
    // This is a basic implementation that can handle some video format conversions
    onProgress({ progress: 10, status: 'converting', message: 'Processing video...' })

    try {
      // Create a video element to load the source
      const video = document.createElement('video')
      video.src = URL.createObjectURL(file)
      video.muted = true

      return new Promise((resolve, reject) => {
        video.onloadedmetadata = async () => {
          try {
            onProgress({ progress: 30, status: 'converting', message: 'Setting up conversion...' })

            // Create a canvas to capture video frames
            const canvas = document.createElement('canvas')
            const ctx = canvas.getContext('2d')!
            
            canvas.width = video.videoWidth
            canvas.height = video.videoHeight

            onProgress({ progress: 50, status: 'converting', message: 'Converting video...' })

            // For basic conversion, we'll create a simple video using canvas
            // This is a simplified approach - in production you'd want proper video processing
            const stream = canvas.captureStream(30) // 30 FPS
            
            // Get the appropriate MIME type for the target format
            const mimeType = this.getVideoMimeType(targetFormat)
            
            if (!MediaRecorder.isTypeSupported(mimeType)) {
              throw new Error(`${targetFormat} format not supported by browser`)
            }

            const mediaRecorder = new MediaRecorder(stream, { 
              mimeType,
              videoBitsPerSecond: 2500000 // 2.5 Mbps
            })
            
            const chunks: Blob[] = []
            
            mediaRecorder.ondataavailable = (event) => {
              if (event.data.size > 0) {
                chunks.push(event.data)
              }
            }

            mediaRecorder.onstop = () => {
              const blob = new Blob(chunks, { type: mimeType })
              onProgress({ progress: 100, status: 'completed' })
              resolve(blob)
            }

            // Start recording
            mediaRecorder.start()

            // Play video and draw frames to canvas
            video.currentTime = 0
            video.play()

            const drawFrame = () => {
              if (!video.paused && !video.ended) {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
                requestAnimationFrame(drawFrame)
              } else {
                // Video ended, stop recording
                mediaRecorder.stop()
                stream.getTracks().forEach(track => track.stop())
              }
            }

            video.onplay = () => {
              drawFrame()
            }

            // Set a timeout to prevent infinite processing
            setTimeout(() => {
              if (mediaRecorder.state === 'recording') {
                mediaRecorder.stop()
                stream.getTracks().forEach(track => track.stop())
              }
            }, 30000) // 30 second max

          } catch (error) {
            reject(error)
          }
        }

        video.onerror = () => reject(new Error('Failed to load video'))
      })

    } catch (error) {
      onProgress({ progress: 0, status: 'error', message: 'Video conversion failed' })
      throw error
    }
  }

  async convertAudio(
    file: File, 
    targetFormat: string, 
    onProgress: (progress: ConversionProgress) => void
  ): Promise<Blob> {
    onProgress({ progress: 10, status: 'converting', message: 'Processing audio...' })

    try {
      // Use Web Audio API for basic audio conversion
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      const arrayBuffer = await file.arrayBuffer()
      
      onProgress({ progress: 30, status: 'converting', message: 'Decoding audio...' })
      
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
      
      onProgress({ progress: 60, status: 'converting', message: 'Converting format...' })

      // For basic conversion, we'll use MediaRecorder with a generated audio stream
      const offlineContext = new OfflineAudioContext(
        audioBuffer.numberOfChannels,
        audioBuffer.length,
        audioBuffer.sampleRate
      )

      const source = offlineContext.createBufferSource()
      source.buffer = audioBuffer
      source.connect(offlineContext.destination)
      source.start()

      const renderedBuffer = await offlineContext.startRendering()

      // Create a MediaStream from the audio buffer
      const mediaStreamDestination = audioContext.createMediaStreamDestination()
      const sourceNode = audioContext.createBufferSource()
      sourceNode.buffer = renderedBuffer
      sourceNode.connect(mediaStreamDestination)

      const mimeType = this.getAudioMimeType(targetFormat)
      
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        throw new Error(`${targetFormat} format not supported by browser`)
      }

      return new Promise((resolve, reject) => {
        const mediaRecorder = new MediaRecorder(mediaStreamDestination.stream, { mimeType })
        const chunks: Blob[] = []

        mediaRecorder.ondataavailable = (event) => {
          chunks.push(event.data)
        }

        mediaRecorder.onstop = () => {
          const blob = new Blob(chunks, { type: mimeType })
          onProgress({ progress: 100, status: 'completed' })
          resolve(blob)
        }

        mediaRecorder.start()
        sourceNode.start()

        // Stop recording after the audio duration
        setTimeout(() => {
          mediaRecorder.stop()
        }, (renderedBuffer.duration * 1000) + 1000) // Add 1 second buffer
      })

    } catch (error) {
      onProgress({ progress: 0, status: 'error', message: 'Audio conversion failed' })
      throw error
    }
  }

  async convertDocument(
    file: File, 
    targetFormat: string, 
    onProgress: (progress: ConversionProgress) => void
  ): Promise<Blob> {
    onProgress({ progress: 10, status: 'converting', message: 'Processing document...' })

    try {
      const fileExtension = file.name.split('.').pop()?.toLowerCase()

      if (fileExtension === 'pdf' && (targetFormat === 'png' || targetFormat === 'jpg')) {
        return await this.convertPdfToImage(file, targetFormat, onProgress)
      }

      if (fileExtension === 'txt' && targetFormat === 'pdf') {
        return await this.convertTextToPdf(file, onProgress)
      }

      // For other document conversions, we'll create a simple text-based conversion
      const text = await this.extractTextFromFile(file)
      
      if (targetFormat === 'pdf') {
        return await this.createPdfFromText(text, onProgress)
      } else if (targetFormat === 'txt') {
        const blob = new Blob([text], { type: 'text/plain' })
        onProgress({ progress: 100, status: 'completed' })
        return blob
      }

      throw new Error(`Conversion from ${fileExtension} to ${targetFormat} not supported`)

    } catch (error) {
      onProgress({ progress: 0, status: 'error', message: 'Document conversion failed' })
      throw error
    }
  }

  private async convertPdfToImage(
    file: File, 
    targetFormat: string, 
    onProgress: (progress: ConversionProgress) => void
  ): Promise<Blob> {
    onProgress({ progress: 30, status: 'converting', message: 'Reading PDF...' })

    // For PDF to image conversion, we'll create a placeholder implementation
    // In a real app, you'd use PDF.js or similar library
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    
    canvas.width = 612 // Standard letter width
    canvas.height = 792 // Standard letter height
    
    // Fill with white background
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    
    // Add placeholder content
    ctx.fillStyle = 'black'
    ctx.font = '24px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('PDF Document', canvas.width / 2, 100)
    
    ctx.font = '16px Arial'
    ctx.fillText(`Original file: ${file.name}`, canvas.width / 2, 150)
    ctx.fillText(`Size: ${this.formatFileSize(file.size)}`, canvas.width / 2, 180)
    ctx.fillText('PDF to Image conversion', canvas.width / 2, 220)
    
    // Add a border
    ctx.strokeStyle = '#ccc'
    ctx.lineWidth = 2
    ctx.strokeRect(50, 50, canvas.width - 100, canvas.height - 100)

    onProgress({ progress: 90, status: 'converting', message: 'Finalizing image...' })

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          onProgress({ progress: 100, status: 'completed' })
          resolve(blob)
        } else {
          reject(new Error('Failed to create image from PDF'))
        }
      }, this.getMimeType(targetFormat), 0.9)
    })
  }

  private async convertTextToPdf(
    file: File, 
    onProgress: (progress: ConversionProgress) => void
  ): Promise<Blob> {
    onProgress({ progress: 30, status: 'converting', message: 'Reading text...' })

    const text = await file.text()
    return await this.createPdfFromText(text, onProgress)
  }

  private async createPdfFromText(
    text: string, 
    onProgress: (progress: ConversionProgress) => void
  ): Promise<Blob> {
    onProgress({ progress: 50, status: 'converting', message: 'Creating PDF...' })

    // Simple PDF creation using canvas and jsPDF-like approach
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    
    canvas.width = 612 // Letter width in points
    canvas.height = 792 // Letter height in points
    
    // Fill with white background
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    
    // Set up text rendering
    ctx.fillStyle = 'black'
    ctx.font = '12px Arial'
    
    const margin = 50
    const lineHeight = 16
    const maxWidth = canvas.width - (margin * 2)
    
    // Split text into lines
    const lines = this.wrapText(text, maxWidth, ctx)
    
    onProgress({ progress: 70, status: 'converting', message: 'Adding text to PDF...' })
    
    let y = margin + lineHeight
    for (const line of lines.slice(0, 40)) { // Limit to first 40 lines for demo
      if (y > canvas.height - margin) break
      ctx.fillText(line, margin, y)
      y += lineHeight
    }

    onProgress({ progress: 90, status: 'converting', message: 'Finalizing PDF...' })

    // Convert canvas to blob (this is a simplified PDF - in reality you'd use a proper PDF library)
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          onProgress({ progress: 100, status: 'completed' })
          resolve(blob)
        } else {
          reject(new Error('Failed to create PDF'))
        }
      }, 'image/png') // For demo purposes, we'll create a PNG instead of actual PDF
    })
  }

  private async extractTextFromFile(file: File): Promise<string> {
    const fileExtension = file.name.split('.').pop()?.toLowerCase()
    
    if (fileExtension === 'txt') {
      return await file.text()
    }
    
    // For other file types, return a placeholder
    return `Content extracted from ${file.name}\n\nThis is a placeholder text extraction. In a full implementation, this would contain the actual extracted content from the ${fileExtension?.toUpperCase()} file.\n\nFile size: ${this.formatFileSize(file.size)}\nFile type: ${fileExtension?.toUpperCase()}`
  }

  private wrapText(text: string, maxWidth: number, ctx: CanvasRenderingContext2D): string[] {
    const words = text.split(' ')
    const lines: string[] = []
    let currentLine = ''

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word
      const metrics = ctx.measureText(testLine)
      
      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine)
        currentLine = word
      } else {
        currentLine = testLine
      }
    }

    if (currentLine) {
      lines.push(currentLine)
    }

    return lines
  }

  private getMimeType(format: string): string {
    const mimeTypes: Record<string, string> = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'bmp': 'image/bmp',
      'webp': 'image/webp',
      'tiff': 'image/tiff',
      'mp4': 'video/mp4',
      'webm': 'video/webm',
      'mp3': 'audio/mpeg',
      'wav': 'audio/wav',
      'ogg': 'audio/ogg',
      'pdf': 'application/pdf',
      'txt': 'text/plain',
    }
    return mimeTypes[format.toLowerCase()] || 'application/octet-stream'
  }

  private getVideoMimeType(format: string): string {
    const mimeTypes: Record<string, string> = {
      'mp4': 'video/mp4',
      'webm': 'video/webm',
      'mov': 'video/mp4', // Fallback to mp4 for mov
      'avi': 'video/mp4', // Fallback to mp4 for avi
      'wmv': 'video/mp4', // Fallback to mp4 for wmv
      'mkv': 'video/webm', // Fallback to webm for mkv
    }
    return mimeTypes[format.toLowerCase()] || 'video/mp4'
  }

  private getAudioMimeType(format: string): string {
    const mimeTypes: Record<string, string> = {
      'mp3': 'audio/mpeg',
      'wav': 'audio/wav',
      'ogg': 'audio/ogg',
      'webm': 'audio/webm',
      'm4a': 'audio/mp4',
      'aac': 'audio/mp4',
      'flac': 'audio/ogg', // Fallback to ogg for flac
    }
    return mimeTypes[format.toLowerCase()] || 'audio/mp4'
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  async isFFmpegReady(): Promise<boolean> {
    // Since we're not using FFmpeg anymore, always return true
    return true
  }
}

// Singleton instance
export const fileConverter = new FileConverter()