// План 28: протоколы лаборатории и акты комиссии в Excel.
import type { ActBundle } from "@idk/shared/workbook/bundle";
import { HttpError } from "../../http/router.ts";

export function protoXlsx(_b: ActBundle): { xlsx: Buffer; name: string } {
  throw new HttpError(400, "Для этого документа Excel не формируется");
}
