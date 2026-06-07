"use client";

import { Switch } from "@headlessui/react";

interface EnableSwitchProps {
    enabled: boolean;
    onChange: (value: boolean) => void;
    disabled: boolean;
}

export function EnableSwitch({ enabled, onChange: setEnabled, disabled }: EnableSwitchProps) {
    return <div className="text-xl flex flex-row gap-4 items-center">
        <p>Enabled</p>
        <Switch
            checked={enabled}
            onChange={setEnabled}
            disabled={disabled}
            className="group inline-flex h-6 w-11 items-center rounded-full bg-neutral-500 transition data-checked:bg-blue-500"
        >
            <span className="size-4 translate-x-1 rounded-full bg-white transition group-data-checked:translate-x-6"/>
        </Switch>
    </div>
}