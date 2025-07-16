import { useState, useCallback, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card'
import { Button } from './components/ui/button'
import { Progress } from './components/ui/progress'
import { Badge } from './components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs'
import { Separator } from './components/ui/separator'
import { 
  Upload, 
  FileText, 
  Image, 
  Video, 
  Music, 
  Download, 
  X, 
  CheckCircle, 
  AlertCircle,
  FileIcon,
  Trash2,
  RefreshCw
} from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'
import { fileConverter } from './utils/fileConverter'

interface ConversionFile {
  id: string
  file: File
  originalFormat: string
  targetFormat: string
  status: 'pending' | 'converting' | 'completed' | 'error'
  progress: number
  downloadUrl?: string
  error?: string
}

const SUPPORTED_FORMATS = {
  image: {
    input: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'tiff', 'svg'],
    output: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'tiff']
  },
  video: {
    input: ['mp4', 'avi', 'mov', 'wmv', 'flv', 'mkv', 'webm', 'm4v'],
    output: ['mp4', 'avi', 'mov', 'wmv', 'webm', 'mkv']
  },
  audio: {
    input: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma'],
    output: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a']
  },
  document: {
    input: ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt'],
    output: ['pdf', 'doc', 'docx', 'txt', 'rtf', 'png', 'jpg']
  }
}

const getFileCategory = (extension: string): keyof typeof SUPPORTED_FORMATS | null => {
  const ext = extension.toLowerCase()
  for (const [category, formats] of Object.entries(SUPPORTED_FORMATS)) {
    if (formats.input.includes(ext)) {
      return category as keyof typeof SUPPORTED_FORMATS
    }
  }
  return null
}

const getFileIcon = (extension: string) => {
  const category = getFileCategory(extension)
  switch (category) {
    case 'image': return <Image className="w-5 h-5" />
    case 'video': return <Video className="w-5 h-5" />
    case 'audio': return <Music className="w-5 h-5" />
    case 'document': return <FileText className="w-5 h-5" />
    default: return <FileIcon className="w-5 h-5" />
  }
}

function App() {
  const [files, setFiles] = useState<ConversionFile[]>([])
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    const droppedFiles = Array.from(e.dataTransfer.files)
    handleFiles(droppedFiles)
  }, [])

  const handleFiles = (fileList: File[]) => {
    const newFiles: ConversionFile[] = fileList.map(file => {
      const extension = file.name.split('.').pop()?.toLowerCase() || ''
      const category = getFileCategory(extension)
      
      if (!category) {
        toast.error(`Unsupported file format: ${extension}`)
        return null
      }

      return {
        id: Math.random().toString(36).substr(2, 9),
        file,
        originalFormat: extension,
        targetFormat: SUPPORTED_FORMATS[category].output[0], // Default to first output format
        status: 'pending' as const,
        progress: 0
      }
    }).filter(Boolean) as ConversionFile[]

    setFiles(prev => [...prev, ...newFiles])
    toast.success(`Added ${newFiles.length} file(s) for conversion`)
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(Array.from(e.target.files))
    }
  }

  const updateFileFormat = (fileId: string, newFormat: string) => {
    setFiles(prev => prev.map(file => 
      file.id === fileId ? { ...file, targetFormat: newFormat } : file
    ))
  }

  const removeFile = (fileId: string) => {
    setFiles(prev => prev.filter(file => file.id !== fileId))
  }

  const convertFile = async (fileId: string) => {
    const file = files.find(f => f.id === fileId)
    if (!file) return

    const category = getFileCategory(file.originalFormat)
    if (!category) {
      toast.error('Unsupported file format')
      return
    }

    // Update status to converting
    setFiles(prev => prev.map(f => 
      f.id === fileId ? { ...f, status: 'converting' as const, progress: 0 } : f
    ))

    try {
      let convertedBlob: Blob

      const onProgress = (progress: { progress: number; status: string; message?: string }) => {
        setFiles(prev => prev.map(f => 
          f.id === fileId ? { 
            ...f, 
            progress: progress.progress,
            status: progress.status as 'converting' | 'completed' | 'error'
          } : f
        ))
      }

      // Perform actual conversion based on file category
      switch (category) {
        case 'image':
          convertedBlob = await fileConverter.convertImage(file.file, file.targetFormat, onProgress)
          break
        case 'video':
          convertedBlob = await fileConverter.convertVideo(file.file, file.targetFormat, onProgress)
          break
        case 'audio':
          convertedBlob = await fileConverter.convertAudio(file.file, file.targetFormat, onProgress)
          break
        case 'document':
          convertedBlob = await fileConverter.convertDocument(file.file, file.targetFormat, onProgress)
          break
        default:
          throw new Error(`Conversion not supported for ${category}`)
      }

      // Create download URL
      const downloadUrl = URL.createObjectURL(convertedBlob)

      setFiles(prev => prev.map(f => 
        f.id === fileId ? { 
          ...f, 
          status: 'completed' as const, 
          progress: 100,
          downloadUrl 
        } : f
      ))

      toast.success(`${file.file.name} converted successfully!`)

    } catch (error) {
      console.error('Conversion error:', error)
      setFiles(prev => prev.map(f => 
        f.id === fileId ? { 
          ...f, 
          status: 'error' as const, 
          error: error instanceof Error ? error.message : 'Conversion failed'
        } : f
      ))
      toast.error(`Failed to convert ${file.file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const convertAll = async () => {
    const pendingFiles = files.filter(f => f.status === 'pending')
    for (const file of pendingFiles) {
      await convertFile(file.id)
    }
  }

  const clearAll = () => {
    setFiles([])
    toast.success('All files cleared')
  }

  const downloadFile = (file: ConversionFile) => {
    if (file.downloadUrl) {
      const a = document.createElement('a')
      a.href = file.downloadUrl
      a.download = `${file.file.name.split('.')[0]}.${file.targetFormat}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-foreground mb-2">
              Universal File Converter
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Convert files between different formats including video, image, document, and audio files. 
              Fast, secure, and easy to use.
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Upload Section */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Upload Files
            </CardTitle>
            <CardDescription>
              Drag and drop files or click to browse. Supports 20+ file formats.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                dragActive 
                  ? 'border-primary bg-primary/5' 
                  : 'border-muted-foreground/25 hover:border-primary/50'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium mb-2">
                Drop files here or click to browse
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                Supports images, videos, documents, and audio files
              </p>
              <Button 
                onClick={() => fileInputRef.current?.click()}
                className="mb-4"
              >
                Choose Files
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileInput}
                className="hidden"
                accept=".jpg,.jpeg,.png,.gif,.bmp,.webp,.tiff,.svg,.mp4,.avi,.mov,.wmv,.flv,.mkv,.webm,.m4v,.mp3,.wav,.flac,.aac,.ogg,.m4a,.wma,.pdf,.doc,.docx,.txt,.rtf,.odt"
              />
            </div>
          </CardContent>
        </Card>

        {/* Supported Formats */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Supported Formats</CardTitle>
            <CardDescription>
              We support conversion between these popular file formats
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="image" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="image" className="flex items-center gap-2">
                  <Image className="w-4 h-4" />
                  Images
                </TabsTrigger>
                <TabsTrigger value="video" className="flex items-center gap-2">
                  <Video className="w-4 h-4" />
                  Videos
                </TabsTrigger>
                <TabsTrigger value="audio" className="flex items-center gap-2">
                  <Music className="w-4 h-4" />
                  Audio
                </TabsTrigger>
                <TabsTrigger value="document" className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Documents
                </TabsTrigger>
              </TabsList>
              
              {Object.entries(SUPPORTED_FORMATS).map(([category, formats]) => (
                <TabsContent key={category} value={category} className="mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-medium mb-2">Input Formats</h4>
                      <div className="flex flex-wrap gap-2">
                        {formats.input.map(format => (
                          <Badge key={format} variant="secondary">
                            .{format}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h4 className="font-medium mb-2">Output Formats</h4>
                      <div className="flex flex-wrap gap-2">
                        {formats.output.map(format => (
                          <Badge key={format} variant="outline">
                            .{format}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>

        {/* Conversion Queue */}
        {files.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <RefreshCw className="w-5 h-5" />
                    Conversion Queue ({files.length})
                  </CardTitle>
                  <CardDescription>
                    Manage your file conversions
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button 
                    onClick={convertAll}
                    disabled={files.every(f => f.status !== 'pending')}
                  >
                    Convert All
                  </Button>
                  <Button variant="outline" onClick={clearAll}>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Clear All
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {files.map((file) => {
                  const category = getFileCategory(file.originalFormat)
                  const availableFormats = category ? SUPPORTED_FORMATS[category].output : []
                  
                  return (
                    <div key={file.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          {getFileIcon(file.originalFormat)}
                          <div>
                            <p className="font-medium">{file.file.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {formatFileSize(file.file.size)} • {file.originalFormat.toUpperCase()}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFile(file.id)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>

                      <div className="flex items-center gap-4 mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">Convert to:</span>
                          <Select
                            value={file.targetFormat}
                            onValueChange={(value) => updateFileFormat(file.id, value)}
                            disabled={file.status === 'converting'}
                          >
                            <SelectTrigger className="w-24">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {availableFormats.map(format => (
                                <SelectItem key={format} value={format}>
                                  .{format}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="flex items-center gap-2">
                          {file.status === 'pending' && (
                            <Button 
                              size="sm" 
                              onClick={() => convertFile(file.id)}
                            >
                              Convert
                            </Button>
                          )}
                          {file.status === 'converting' && (
                            <div className="flex items-center gap-2">
                              <RefreshCw className="w-4 h-4 animate-spin" />
                              <span className="text-sm">Converting...</span>
                            </div>
                          )}
                          {file.status === 'completed' && (
                            <div className="flex items-center gap-2">
                              <CheckCircle className="w-4 h-4 text-green-500" />
                              <Button 
                                size="sm" 
                                onClick={() => downloadFile(file)}
                              >
                                <Download className="w-4 h-4 mr-2" />
                                Download
                              </Button>
                            </div>
                          )}
                          {file.status === 'error' && (
                            <div className="flex items-center gap-2">
                              <AlertCircle className="w-4 h-4 text-red-500" />
                              <span className="text-sm text-red-500">Error</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {file.status === 'converting' && (
                        <div className="space-y-2">
                          <Progress value={file.progress} className="w-full" />
                          <p className="text-sm text-muted-foreground">
                            {file.progress}% complete
                          </p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center text-muted-foreground">
            <p>© 2024 Universal File Converter. Fast, secure, and reliable file conversion.</p>
          </div>
        </div>
      </footer>

      {/* Toast notifications */}
      <Toaster 
        position="bottom-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: 'hsl(var(--card))',
            color: 'hsl(var(--card-foreground))',
            border: '1px solid hsl(var(--border))',
          },
        }}
      />
    </div>
  )
}

export default App