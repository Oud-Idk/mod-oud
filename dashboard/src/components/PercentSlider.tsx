import { Slider } from "radix-ui";

interface PercentSliderProps {
    value: number;
    onChange: (value: number) => void;
    label?: string;
}

export function PercentSlider({ value, onChange, label }: PercentSliderProps) {
    return (
        <div className="flex flex-col gap-2 w-full max-w-sm">
            <div className="flex justify-between text-sm font-medium">
                {label && <span>{label}</span>}
                <span className="font-mono">{Math.round(value * 100)}%</span>
            </div>

            <Slider.Root
                className="relative flex items-center select-none touch-none w-full h-5"
                value={[value]}
                onValueChange={(values) => onChange(values[0])}
                min={0}
                max={1}
                step={0.01}
            >
                <Slider.Track className="bg-neutral-500/50 relative grow rounded-full h-1.5">
                    <Slider.Range className="absolute rounded-full h-full bg-blue-500"/>
                </Slider.Track>

                <Slider.Thumb
                    className="block w-4 h-4 bg-white border border-gray-300 rounded-full shadow-md hover:scale-115 active:scale-95 cursor-pointer transition-transform"
                    aria-label={label || "Percentage"}
                />
            </Slider.Root>
        </div>
    );
}