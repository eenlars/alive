import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { structuredErrorResponse } from "@/lib/api/responses";
import { ErrorCodes } from "@/lib/error-codes";

const LOG_DIR = path.join(process.cwd(), "../../../../logs");

/**
 * GET endpoint to view a specific deployment log
 * Access: /api/webhook/deploy/logs/deploy-2025-01-15T10-30-00.log
 */
export async function GET(
	req: NextRequest,
	{ params }: { params: Promise<{ filename: string }> },
) {
	const requestId = randomUUID();

	try {
		const { filename } = await params;

		// Security: only allow reading deploy-*.log files
		if (!filename.match(/^deploy-[\d\-T]+\.log$/)) {
			return structuredErrorResponse(ErrorCodes.INVALID_REQUEST, { status: 400, details: { requestId } });
		}

		const logPath = path.join(LOG_DIR, filename);

		// Check if file exists
		if (!fs.existsSync(logPath)) {
			return structuredErrorResponse(ErrorCodes.FILE_READ_ERROR, { status: 404, details: { requestId } });
		}

		// Read log content
		const content = fs.readFileSync(logPath, "utf-8");

		// Return as plain text
		return new Response(content, {
			headers: {
				"Content-Type": "text/plain; charset=utf-8",
			},
		});
	} catch (error) {
		console.error("[WEBHOOK LOGS] Error:", error);
		return structuredErrorResponse(ErrorCodes.FILE_READ_ERROR, {
			status: 500,
			details: { requestId, exception: error instanceof Error ? error.message : "Unknown error" },
		});
	}
}
