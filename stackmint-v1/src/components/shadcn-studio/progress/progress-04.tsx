import { Field, FieldLabel } from '@/components/ui/field'
import { Progress } from '@/components/ui/progress'

const ProgressShapeDemo = () => {
  return (
    <div className='flex w-full flex-col gap-3'>
      {/* Standard progress bar */}
      <Field>
        <FieldLabel htmlFor='progress-rounded'>
          <span>Rounded</span>
          <span className='ml-auto'>40%</span>
        </FieldLabel>
        <Progress value={40} id='progress-rounded' className='h-2' />
      </Field>

      {/* Pill progress bar */}
      <Field>
        <FieldLabel htmlFor='progress-pill'>
          <span>Pill</span>
          <span className='ml-auto'>60%</span>
        </FieldLabel>
        <Progress value={60} id='progress-pill' className='h-2 *:data-[slot=progress-indicator]:rounded-r-full' />
      </Field>

      {/* Sharp progress bar */}
      <Field>
        <FieldLabel htmlFor='progress-sharp'>
          <span>Sharp</span>
          <span className='ml-auto'>80%</span>
        </FieldLabel>
        <Progress value={80} id='progress-sharp' className='h-2 rounded-none' />
      </Field>
    </div>
  )
}

export default ProgressShapeDemo
