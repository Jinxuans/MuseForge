import type { TaskParams, TaskRecord } from '../../types'
import { DetailParamValue } from '../../lib/paramDisplay'

type TaskParamSummaryProps = {
  task: TaskRecord
  isAgentTask: boolean
  currentActualParams?: Partial<TaskParams>
  showSourceInfo: boolean
  taskProviderName: string
  taskProfileName: string
  taskModel: string
}

export default function TaskParamSummary({
  task,
  isAgentTask,
  currentActualParams,
  showSourceInfo,
  taskProviderName,
  taskProfileName,
  taskModel,
}: TaskParamSummaryProps) {
  return (
    <>
      <h3 className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
        参数配置
      </h3>
      {showSourceInfo && (
        <div className="mb-2 rounded-lg bg-gray-50 px-3 py-2 text-xs dark:bg-white/[0.03]">
          <span className="text-gray-400 dark:text-gray-500">来源</span>
          <br />
          <span className="font-medium text-gray-700 dark:text-gray-200">{taskProviderName}</span>
          <span className="text-gray-400 dark:text-gray-500"> · {taskProfileName} · {taskModel}</span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 text-xs mb-4">
        <div className="bg-gray-50 dark:bg-white/[0.03] rounded-lg px-3 py-2">
          <span className="text-gray-400 dark:text-gray-500">尺寸</span>
          <br />
          <DetailParamValue task={task} paramKey="size" className="font-medium" actualParams={currentActualParams} />
        </div>
        <div className="bg-gray-50 dark:bg-white/[0.03] rounded-lg px-3 py-2">
          <span className="text-gray-400 dark:text-gray-500">质量</span>
          <br />
          <DetailParamValue task={task} paramKey="quality" className="font-medium" actualParams={currentActualParams} />
        </div>
        <div className="bg-gray-50 dark:bg-white/[0.03] rounded-lg px-3 py-2">
          <span className="text-gray-400 dark:text-gray-500">格式</span>
          <br />
          <DetailParamValue task={task} paramKey="output_format" className="font-medium" actualParams={currentActualParams} />
        </div>
        <div className="bg-gray-50 dark:bg-white/[0.03] rounded-lg px-3 py-2">
          <span className="text-gray-400 dark:text-gray-500">审核</span>
          <br />
          <DetailParamValue task={task} paramKey="moderation" className="font-medium" actualParams={currentActualParams} />
        </div>
        {!isAgentTask && (
          <div className="bg-gray-50 dark:bg-white/[0.03] rounded-lg px-3 py-2">
            <span className="text-gray-400 dark:text-gray-500">数量</span>
            <br />
            <DetailParamValue task={task} paramKey="n" className="font-medium" />
          </div>
        )}
        {task.params.output_compression != null && (
          <div className="bg-gray-50 dark:bg-white/[0.03] rounded-lg px-3 py-2">
            <span className="text-gray-400 dark:text-gray-500">压缩率</span>
            <br />
            <DetailParamValue task={task} paramKey="output_compression" className="font-medium" actualParams={currentActualParams} />
          </div>
        )}
      </div>
    </>
  )
}
