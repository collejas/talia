<?php
/**
 * The front page template file
 *
 * If the user has selected a static page for their homepage, this is what will
 * appear.
 * Learn more: https://developer.wordpress.org/themes/basics/template-hierarchy/
 *
 * @package WordPress
 * @subpackage Twenty_Seventeen
 * @since Twenty Seventeen 1.0
 * @version 1.0
 */

get_header(); ?>

<div id="primary" class="content-area">
	<main id="main" class="site-main">

		<?php
		// Show the selected front page content.
		if ( have_posts() ) :
			while ( have_posts() ) :
				the_post();
				get_template_part( 'template-parts/page/content', 'front-page' );
			endwhile;
		else :
			get_template_part( 'template-parts/post/content', 'none' );
		endif;
		?>

		<?php
		// Get each of our panels and show the post data.
		if ( 0 !== twentyseventeen_panel_count() || is_customize_preview() ) : // If we have pages to show.

			/**
			 * Filters the number of front page sections in Twenty Seventeen.
			 *
			 * @since Twenty Seventeen 1.0
			 *
			 * @global int|string $twentyseventeencounter Front page section counter.
			 *
			 * @param int $num_sections Number of front page sections.
			 */
			$num_sections = apply_filters( 'twentyseventeen_front_page_sections', 4 );
			global $twentyseventeencounter;

			// Create a setting and control for each of the sections available in the theme.
			for ( $i = 1; $i < ( 1 + $num_sections ); $i++ ) {
				$twentyseventeencounter = $i;
				twentyseventeen_front_page_section( null, $i );
			}

		endif; // The if ( 0 !== twentyseventeen_panel_count() ) ends here.
		?>

	</main><!-- #main -->
</div><!-- #primary -->

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
		Chatea con nosotros
	</button>
</div>

<script type="module">
	const TENANT_ALIAS = "lia";
	const API_BASE = "https://talia.mx/api/webchat";
	const loadWebchat = async () => {
		const widgetModule = await import("/wp-content/themes/twentyseventeen/webchat-widget.js");
		widgetModule.initialiseChat({
			tenantAlias: TENANT_ALIAS,
			apiBaseUrl: API_BASE,
			chatLog: document.getElementById("chat-log"),
			chatForm: document.getElementById("chat-form"),
			chatInput: document.getElementById("chat-input"),
			chatAttachmentButton: document.getElementById("chat-attachment-button"),
			chatFileInput: document.getElementById("chat-file-input"),
			chatAttachments: document.getElementById("chat-attachments"),
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
			toggle.textContent = open ? "Cerrar chat" : "Chatea con nosotros";
		};

		setState(false);

		toggle.addEventListener("click", function () {
			setState(!widget.classList.contains(openClass));
		});

		window.addEventListener("load", function () {
			window.setTimeout(function () {
				window.scrollTo({ top: 0, behavior: "auto" });
			}, 10);
		});
	})();
</script>

<?php
get_footer();
