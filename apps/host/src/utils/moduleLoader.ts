// =============================================================================
// Module Loader — IIFE Script Injection
// =============================================================================
// Loads module bundles by injecting <script> tags into the document.
// Each module is a self-contained IIFE that calls window.__NKZ__.register().
//
// Flow:
// 1. loadModuleScript(bundleUrl) → creates <script src="...">
// 2. Script executes → IIFE calls window.__NKZ__.register({ id, viewerSlots })
// 3. ModuleContext listens via window.__NKZ__.onRegister() and updates state
// =============================================================================

// =============================================================================
// Script Loading Cache
// =============================================================================

/** Track loading state per URL to avoid duplicate script tags */
const scriptLoadCache = new Map<string, Promise<void>>();

/** Track which scripts have been injected (by URL) */
const injectedScripts = new Set<string>();

// =============================================================================
// Core Loading Function
// =============================================================================

/**
 * Load a module bundle by injecting a <script> tag.
 * Returns a promise that resolves when the script has loaded (not necessarily registered).
 * Registration happens asynchronously via window.__NKZ__.register().
 *
 * @param bundleUrl - URL to the IIFE bundle (e.g., "/modules/catastro-spain/nkz-module.js")
 * @param moduleId - Module ID (for logging and cache-busting)
 * @returns Promise that resolves when the script is loaded
 */
export function loadModuleScript(bundleUrl: string, moduleId: string): Promise<void> {
    // Resolve relative URLs
    const fullUrl = bundleUrl.startsWith('http')
        ? bundleUrl
        : `${window.location.origin}${bundleUrl}`;

    // Return cached promise if already loading/loaded
    if (scriptLoadCache.has(fullUrl)) {
        console.debug(`[ModuleLoader] Script already loading/loaded: ${moduleId} (${fullUrl})`);
        return scriptLoadCache.get(fullUrl)!;
    }

    // Check if script tag already exists in DOM
    if (injectedScripts.has(fullUrl)) {
        console.debug(`[ModuleLoader] Script already injected: ${moduleId}`);
        return Promise.resolve();
    }

    const loadPromise = new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = fullUrl;
        script.async = true;
        script.setAttribute('data-nkz-module', moduleId);

        script.onload = () => {
            injectedScripts.add(fullUrl);
            console.log(`[ModuleLoader] ✅ Script loaded: ${moduleId} (${fullUrl})`);
            resolve();
        };

        script.onerror = (event) => {
            console.error(`[ModuleLoader] ❌ Failed to load script: ${moduleId} (${fullUrl})`, event);
            scriptLoadCache.delete(fullUrl);
            reject(new Error(`Failed to load module script: ${moduleId} from ${fullUrl}`));
        };

        document.head.appendChild(script);
        console.log(`[ModuleLoader] Injecting script: ${moduleId} → ${fullUrl}`);
    });

    scriptLoadCache.set(fullUrl, loadPromise);
    return loadPromise;
}

// =============================================================================
// Bulk Loading
// =============================================================================

interface ModuleLoadSpec {
    id: string;
    bundleUrl: string;
}

/**
 * Load multiple module scripts in parallel.
 * Errors are caught per-module to prevent one failure from blocking others.
 *
 * @returns Array of results with module ID and success/error status
 */
export async function loadModuleScripts(
    modules: ModuleLoadSpec[]
): Promise<Array<{ id: string; success: boolean; error?: Error }>> {
    const results = await Promise.allSettled(
        modules.map(async (mod) => {
            await loadModuleScript(mod.bundleUrl, mod.id);
            return mod.id;
        })
    );

    return results.map((result, index) => {
        if (result.status === 'fulfilled') {
            return { id: result.value, success: true };
        } else {
            return {
                id: modules[index].id,
                success: false,
                error: result.reason instanceof Error
                    ? result.reason
                    : new Error(String(result.reason)),
            };
        }
    });
}

// =============================================================================
// Cleanup
// =============================================================================

/**
 * Remove a module's script tag from the DOM (for hot-reload or module uninstall).
 */
export function unloadModuleScript(moduleId: string): void {
    const scripts = document.querySelectorAll(`script[data-nkz-module="${moduleId}"]`);
    scripts.forEach(script => {
        const src = (script as HTMLScriptElement).src;
        script.remove();
        scriptLoadCache.delete(src);
        injectedScripts.delete(src);
        console.log(`[ModuleLoader] Removed script: ${moduleId}`);
    });
}

/**
 * Clear all cached state (for testing or full reload).
 */
export function clearScriptCache(): void {
    scriptLoadCache.clear();
    injectedScripts.clear();
}
