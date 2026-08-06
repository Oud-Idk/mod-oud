import React from 'react';
import * as Slider from '@radix-ui/react-slider';
import Footer from "@/components/layout/Footer";

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
        <div className="pt-2">
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
                    <Slider.Track className="bg-surface-muted relative grow rounded-full h-0.75">
                        <Slider.Range className="absolute bg-brand rounded-full h-full"/>
                    </Slider.Track>

                    <Slider.Thumb
                        className="block w-3 h-3 bg-white border border-muted-foreground rounded-full shadow hover:bg-neutral-200 focus-ring"
                        aria-label="Minimum value"
                    />
                    <Slider.Thumb
                        className="block w-3 h-3 bg-white border border-muted-foreground rounded-full shadow hover:bg-neutral-200 focus-ring"
                        aria-label="Maximum value"
                    />
                </Slider.Root>
            </form>

            <div className="flex justify-between mt-2">
                <Footer>Min: {valMin}</Footer>
                <Footer>Max: {valMax}</Footer>
            </div>
        </div>
    );
}