import net from "node:net";
import { spawn } from "node:child_process";

/**
 * Coalesce multiple values, returning the first non-null/undefined one.
 * If strings, returns first non-empty string.
 */
export function coalesce(...values) {
    for (const value of values) {
        if (value === undefined || value === null) {
            continue;
        }
        if (typeof value === "string") {
            const trimmed = value.trim();
            if (trimmed.length > 0) {
                return trimmed;
            }
            continue;
        }
        return value;
    }
    return undefined;
}

/**
 * Convert value to integer safely.
 */
export function toInt(value) {
    if (value === undefined || value === null || value === "") {
        return undefined;
    }
    const number = Number.parseInt(value, 10);
    return Number.isNaN(number) ? undefined : number;
}

/**
 * Convert value to boolean safely.
 */
export function toBool(value) {
    if (typeof value === "boolean") {
        return value;
    }
    if (typeof value === "number") {
        return value !== 0;
    }
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (normalized === "true" || normalized === "1") {
            return true;
        }
        if (normalized === "false" || normalized === "0") {
            return false;
        }
    }
    return undefined;
}

/**
 * Sleep for ms.
 */
export function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Trim string with options.
 */
export function toTrimmedString(value, { allowEmpty = false } = {}) {
    if (typeof value !== "string") {
        return undefined;
    }
    const trimmed = value.trim();
    if (!allowEmpty && trimmed.length === 0) {
        return undefined;
    }
    return trimmed;
}

/**
 * Check if a port is available.
 */
export function checkPort(port, host = "127.0.0.1") {
    return new Promise((resolve, reject) => {
        const tester = net.createServer()
            .once("error", (error) => {
                tester.close();
                reject(error);
            })
            .once("listening", () => {
                tester
                    .once("close", resolve)
                    .close();
            })
            .listen(port, host);
    });
}

/**
 * Find an available port starting from startPort.
 */
export async function findAvailablePort(startPort, host = "127.0.0.1") {
    let port = startPort;
    const limit = startPort + 50;
    while (port <= limit) {
        try {
            await checkPort(port, host);
            return port;
        } catch {
            port += 1;
            if (port > limit) {
                throw new Error("Unable to find a free port for the web server.");
            }
        }
    }
    throw new Error("Unable to find a free port for the web server.");
}

/**
 * Open browser at URL.
 */
export function openBrowser(url) {
    const platform = process.platform;

    if (
        toBool(process.env.DISABLE_AUTO_BROWSER) === true ||
        toBool(process.env.NO_AUTO_BROWSER) === true
    ) {
        return false;
    }

    if (platform === "linux" && !process.env.DISPLAY) {
        return false;
    }

    let command;
    let args;

    if (platform === "win32") {
        command = "cmd";
        args = ["/c", "start", "", url];
    } else if (platform === "darwin") {
        command = "open";
        args = [url];
    } else {
        command = "xdg-open";
        args = [url];
    }

    try {
        const child = spawn(command, args, {
            detached: true,
            stdio: "ignore",
        });
        child.once("error", (error) => {
            console.warn("Could not open browser automatically:", error.message);
            console.log("Please open the URL manually if it did not open automatically.");
        });
        child.unref();
        return true;
    } catch (error) {
        console.warn("Could not open browser automatically:", error.message);
        return false;
    }
}
