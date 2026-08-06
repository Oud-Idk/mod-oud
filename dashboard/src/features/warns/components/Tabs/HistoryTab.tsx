import { TextInput } from "@/components/ui/TextInput";
import { ChangeEvent, MouseEvent, ReactNode, useState } from "react";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/layout/Table";
import { Pad } from "@/components/layout/Pad";
import { X } from "lucide-react";
import { Warn } from "@/features/warns/types";
import { searchWarnsAction } from "@/features/warns/actions";
import { Button } from "@/components/ui/Button";
import Footer from "@/components/layout/Footer";

interface HistoryTabProps {
    guildId: string;
}

export function HistoryTab({ guildId }: HistoryTabProps): ReactNode {
    const [userId, setUserId] = useState("");
    const [warns, setWarns] = useState<Warn[]>([]);
    const [searchedUserId, setSearchedUserId] = useState<string | undefined>(undefined);
    const [reasonModalOpen, setReasonModalOpen] = useState(false);
    const [currentReason, setCurrentReason] = useState<string | null>(null);

    const onSearch = (): void => {
        searchWarnsAction(guildId, userId)
            .then((result) => {
                setWarns(result);
                setSearchedUserId(userId);
            })
            .catch((err) => {
                console.error(err);
            });
    };

    const handleInputChange = (e: ChangeEvent<HTMLInputElement>): void => {
        const alphanumericValue = e.target.value.replace(/[^0-9]/g, "");
        setUserId(alphanumericValue);
    };

    const handleReasonModalClose = (e: MouseEvent<HTMLDivElement>): void => {
        e.preventDefault();
        setReasonModalOpen(false);
    }

    return (
        <div>
            <div className="flex flex-row gap-2 max-w-md mb-2">
                <TextInput
                    value={userId}
                    onChange={handleInputChange}
                    placeholder="Type your User ID"
                    className="font-mono"
                />
                <Button onClick={onSearch}>Search</Button>
            </div>

            {warns.length > 0 && (
                <Table>
                    <TableHeader headers={["Warn ID", "Warned By", "Target User", "Reason", "Timestamp"]}/>
                    <TableBody>
                        {warns.map(warn => {
                            return (
                                <TableRow key={warn.id}>
                                    <TableCell className="font-mono">{warn.id}</TableCell>
                                    <TableCell>{warn.moderator_id}</TableCell>
                                    <TableCell>{warn.user_id}</TableCell>
                                    <TableCell>{warn.reason.length < 50 ? warn.reason :
                                        <span
                                            className="cursor-pointer dark:hover:text-blue-200 hover:text-blue-800"
                                            onClick={() => {
                                                setReasonModalOpen(true);
                                                setCurrentReason(warn.reason);
                                            }}
                                        >{warn.reason.slice(0, 49)}...</span>}</TableCell>
                                    <TableCell>{warn.created_at.toLocaleString()}</TableCell>
                                </TableRow>
                            )
                        })}
                    </TableBody>
                </Table>
            )}

            {(reasonModalOpen && currentReason != null) && (
                <div
                    className="dark:bg-black/30 fixed left-0 top-0 w-screen h-screen backdrop-blur-[2px]"
                    onClick={handleReasonModalClose}
                >
                    <div
                        className="absolute left-1/2 top-1/2 -translate-1/2 bg-black-500 p-4 rounded-xl min-w-xl dark:bg-[#151515] bg-neutral-50 shadow-lg"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex flex-row justify-between">
                            <h1 className="font-semibold text-xl">Full Warn Reason</h1>
                            <X
                                onClick={() => setReasonModalOpen(false)}
                                className="hover:text-red-500 cursor-pointer transition"
                            />
                        </div>
                        <p>{currentReason}</p>
                    </div>
                </div>

            )}

            {searchedUserId && warns.length === 0 && (
                <Footer>    Cannot find warns with user ID {searchedUserId}</Footer>
            )}
        </div>
    );
}