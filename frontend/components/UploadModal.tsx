import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, X } from 'lucide-react';

import { uploadPdf } from '@/lib/api';
import { MODELS } from '@/lib/models';

interface UploadModalProps {
  onClose: () => void;
}

export function UploadModal({ onClose }: UploadModalProps) {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [model, setModel] = useState(MODELS[0].value);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handleFile = useCallback((nextFile: File) => {
    const isPdf = nextFile.type === 'application/pdf' || nextFile.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      setError('只支持 PDF 文件');
      return;
    }
    setError('');
    setFile(nextFile);
  }, []);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files[0];
    if (dropped) handleFile(dropped);
  }, [handleFile]);

  const handleSubmit = async () => {
    if (!file) {
      setError('请先选择 PDF 文件');
      return;
    }

    setUploading(true);
    setError('');
    try {
      const result = await uploadPdf(file, model);
      onClose();
      navigate(`/study/${result.sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="relative w-[520px] rounded-2xl bg-white p-8 shadow-2xl dark:bg-[var(--dark-surface)] dark:shadow-[0_30px_90px_rgba(0,0,0,0.62)]">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:text-[var(--dark-muted)] dark:hover:bg-[var(--dark-surface-elev)]"
        >
          <X size={20} />
        </button>

        <h2 className="text-lg font-semibold mb-6 text-slate-800 dark:text-[var(--dark-text)]">上传课件</h2>

        <div
          className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center gap-3 cursor-pointer transition-colors ${
            dragging
              ? 'border-sky-400 bg-sky-50 dark:border-[var(--dark-border)] dark:bg-[var(--dark-surface-elev)]'
              : 'border-slate-300 dark:border-[var(--dark-border)] hover:border-slate-400 dark:hover:border-[var(--dark-text)]'
          }`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload size={28} className="text-gray-400 dark:text-[var(--dark-muted)]" />
          <p className="text-sm font-medium text-slate-700 dark:text-[var(--dark-text)]">
            {file ? file.name : '拖拽 PDF 到这里'}
          </p>
          <p className="text-xs text-slate-400 dark:text-[var(--dark-muted)]">
            {file
              ? `${(file.size / 1024 / 1024).toFixed(2)} MB · 点击可更换`
              : '或点击选择文件'}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(event) => {
              const nextFile = event.target.files?.[0];
              if (nextFile) handleFile(nextFile);
            }}
          />
        </div>

        <div className="mt-5">
          <p className="mb-2 text-xs text-slate-500 dark:text-[var(--dark-muted)]">选择模型</p>
          <div className="grid grid-cols-3 gap-2">
            {MODELS.map((modelOption) => (
              <button
                key={modelOption.value}
                type="button"
                onClick={() => setModel(modelOption.value)}
                className={`rounded-lg p-3 text-left transition-colors ${
                  model === modelOption.value
                    ? 'bg-gray-900 text-white dark:bg-[var(--dark-surface-elev)] dark:text-[var(--dark-text)]'
                    : 'text-gray-700 hover:bg-gray-100 dark:text-[var(--dark-text)] dark:hover:bg-[var(--dark-surface-elev)]'
                }`}
              >
                <p className={`text-xs font-medium ${model === modelOption.value ? 'text-white dark:text-[var(--dark-text)]' : 'text-gray-800 dark:text-[var(--dark-text)]'}`}>{modelOption.label}</p>
                <p className={`mt-1 text-[11px] leading-snug ${model === modelOption.value ? 'text-gray-300 dark:text-[var(--dark-muted)]' : 'text-gray-400 dark:text-[var(--dark-muted)]'}`}>{modelOption.description}</p>
              </button>
            ))}
          </div>
        </div>

        {error && <p className="mt-3 text-xs text-red-500">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={uploading || !file}
          className="mt-5 h-10 w-full items-center justify-center gap-2 rounded-lg bg-gray-900 text-sm font-medium text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-40 dark:bg-[var(--dark-button-bg)] dark:hover:bg-[var(--dark-button-hover)]"
        >
          {uploading && (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          )}
          {uploading ? '处理中...' : '开始学习'}
        </button>
      </div>
    </div>
  );
}


