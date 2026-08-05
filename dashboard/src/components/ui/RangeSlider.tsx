import React from 'react';
import * as Slider from '@radix-ui/react-slider';

interface RangeSliderProps {
    valMin: number;
    valMax: number;
    min?: number;
    max?: number;
    onChange: (value: number[]) => void;
}

export function RangeSlider({
    valMin,
    valMax,
    min = 0,
    max = 100,
    onChange,
}: RangeSliderProps) {
    return (
        <div className="w-80 py-2">
            <form>
                <Slider.Root
                    className="relative flex items-center select-none touch-none w-full"
                    value={[valMin, valMax]}
                    onValueChange={onChange}
                    max={max}
                    min={min}
                    step={1}
                    minStepsBetweenThumbs={1}
                >
                    <Slider.Track className="bg-neutral-500 relative grow rounded-full h-0.75">
                        <Slider.Range className="absolute bg-blue-500 rounded-full h-full"/>
                    </Slider.Track>

                    <Slider.Thumb
                        className="block w-3 h-3 bg-white border border-neutral-500 rounded-full shadow hover:bg-neutral-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        aria-label="Minimum value"
                    />
                    <Slider.Thumb
                        className="block w-3 h-3 bg-white border border-neutral-500 rounded-full shadow hover:bg-neutral-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        aria-label="Maximum value"
                    />
                </Slider.Root>
            </form>

            <div className="flex justify-between mt-2 text-sm text-neutral-500">
                <span>Min: {valMin}</span>
                <span>Max: {valMax}</span>
            </div>
        </div>
    );
}