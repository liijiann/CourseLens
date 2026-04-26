export interface ModelOption {
  value: string;
  label: string;
  description: string;
}

export const MODELS: ModelOption[] = [
  {
    value: 'qwen3.6-flash',
    label: 'Qwen3.6-Flash',
    description: '兼具速度和准确性',
  },
  {
    value: 'qwen3.6-plus',
    label: 'Qwen3.6-Plus',
    description: '更强推理与复杂任务能力',
  },
  {
    value: 'qwen3.5-flash',
    label: 'Qwen3.5-Flash',
    description: '更低的价格',
  },
];
