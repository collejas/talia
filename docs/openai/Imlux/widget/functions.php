<?php
/**
 *  Functions and definitions for Auxin framework
 *
 * @package    Auxin
 * @author     averta (c) 2014-2024
 * @link       http://averta.net
 */

/*-----------------------------------------------------------------------------------*/
/*  Add your custom functions here -  We recommend you to use "code-snippets" plugin instead
/*  https://wordpress.org/plugins/code-snippets/
/*-----------------------------------------------------------------------------------*/

add_action( 'wp_enqueue_scripts', function () {
    wp_enqueue_style(
        'talia-webchat-css',
        get_stylesheet_directory_uri() . '/css/webchat.css',
        array(),
        null
    );
} );

add_action( 'wp_footer', function () {
    if ( ! is_front_page() && ! is_home() ) {
        return;
    }

    $theme_uri = get_stylesheet_directory_uri();
    ?>
    <div id="talia-webchat-root">
        <div id="talia-webchat-widget" class="talia-webchat-container is-collapsed">
            <div id="chat-log" class="talia-webchat-log"></div>
            <form id="chat-form" class="talia-webchat-form">
                <input id="chat-input" placeholder="Escribe tu mensaje…" autocomplete="off" />
                <button type="submit">Enviar</button>
            </form>
            <button type="button" id="chat-attachment-button">Adjuntar</button>
            <input type="file" id="chat-file-input" hidden />
            <div id="chat-attachments" class="composer-attachments"></div>
        </div>
        <button id="talia-webchat-toggle" class="talia-webchat-toggle" type="button" aria-expanded="false">
            Habla con L-IA
        </button>
    </div>

    <script type="module">
        const TENANT_ALIAS = "imlux";
        const API_BASE = "https://talia.mx/api/webchat";
        const TRACKING_API_BASE = "https://talia.mx/api/crm";

        const loadWebchat = async () => {
            const [widgetModule, trackingModule] = await Promise.all([
                import("<?php echo esc_js( $theme_uri . '/js/webchat-widget.js' ); ?>"),
                import("<?php echo esc_js( $theme_uri . '/js/visit-tracking.js' ); ?>"),
            ]);

            widgetModule.initialiseChat({
                tenantAlias: TENANT_ALIAS,
                apiBaseUrl: API_BASE,
                chatLog: document.getElementById("chat-log"),
                chatForm: document.getElementById("chat-form"),
                chatInput: document.getElementById("chat-input"),
                chatAttachmentButton: document.getElementById("chat-attachment-button"),
                chatFileInput: document.getElementById("chat-file-input"),
                chatAttachments: document.getElementById("chat-attachments"),
                getScrollContainer: () => document.getElementById("talia-webchat-widget"),
            });

            trackingModule.initialiseVisitTracking({
                tenantAlias: TENANT_ALIAS,
                apiBaseUrl: TRACKING_API_BASE,
                linkedSessionStorageKey: "talia-webchat-session",
            });
        };

        loadWebchat().catch((error) => {
            console.error("No se pudo cargar el widget de webchat:", error);
        });
    </script>

    <script>
        (function () {
            const widget = document.getElementById("talia-webchat-widget");
            const toggle = document.getElementById("talia-webchat-toggle");
            if (!widget || !toggle) {
                return;
            }

            const openClass = "is-open";
            const collapsedClass = "is-collapsed";

            const setState = (open) => {
                widget.classList.toggle(openClass, open);
                widget.classList.toggle(collapsedClass, !open);
                toggle.setAttribute("aria-expanded", open ? "true" : "false");
                toggle.textContent = open ? "Cerrar chat" : "Habla con L-IA";
            };

            setState(false);

            toggle.addEventListener("click", function () {
                setState(!widget.classList.contains(openClass));
            });
        })();
    </script>
    <?php
}, 20 );

/*-----------------------------------------------------------------------------------*/
/*  Init theme framework
/*-----------------------------------------------------------------------------------*/
require( 'auxin/auxin-include/auxin.php' );
/*-----------------------------------------------------------------------------------*/

