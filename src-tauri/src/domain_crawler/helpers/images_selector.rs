use futures::future::join_all;
use reqwest::StatusCode;
use scraper::{Html, Selector};
use tokio::time::{timeout, Duration};
use url::Url;

/// Extracts image URLs and alt tags from the HTML content.
///
/// # Arguments
/// * `html` - The HTML content as a string.
/// * `base_url` - The base URL used to resolve relative image URLs.
///
/// # Returns
/// A vector of tuples containing the image URL and its alt text.
pub fn extract_image_urls_and_alts(html: &str, base_url: &Url) -> Vec<(Url, String)> {
    // Parse the HTML document
    let document = Html::parse_document(html);

    // Create a selector for `<img>` tags
    let img_selector = Selector::parse("img").expect("Failed to parse img selector");

    // Iterate over all `<img>` elements in the document
    document
        .select(&img_selector)
        .filter_map(|element| {
            // Check both `src` and `data-src` attributes for the image URL
            let src = element
                .value()
                .attr("src")
                .or_else(|| element.value().attr("data-src"))?;

            // Convert the relative URL to an absolute URL using the base URL
            let url = base_url.join(src).ok()?;

            // Get the `alt` attribute or use an empty string if it doesn't exist
            let alt = element.value().attr("alt").unwrap_or("").to_string();

            // Return a tuple of the image URL and alt text
            Some((url, alt))
        })
        .collect() // Collect all results into a vector
}

/// Fetches the size, content type, and status code of an image using a HEAD request.
///
/// # Arguments
/// * `url` - The URL of the image.
///
/// # Returns
/// A tuple containing the image size in KB, content type, and status code as u16.
async fn fetch_image_size(url: &Url) -> Result<(u64, String, u16), String> {
    // Set a timeout duration for the request (e.g., 5 seconds)
    let timeout_duration = Duration::from_secs(5);

    // Send a HEAD request to the image URL with a timeout
    let response = timeout(
        timeout_duration,
        reqwest::Client::new().head(url.as_str()).send(),
    )
    .await
    .map_err(|_| format!("Timeout while fetching image: {}", url))?
    .map_err(|e| format!("Failed to send request for {}: {}", url, e))?;

    // Get the HTTP status code from the response
    let status_code = response.status();
    let status_code_int = status_code.as_u16();

    // Extract the content type from the response headers
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_string();

    // Initialize content_length with a default value of 0
    let mut content_length: u64 = 0;

    // If the status code is OK (200), proceed to extract the content type and size
    if status_code == StatusCode::OK {
        // Ensure the content type is an image
        if !content_type.contains("image") {
            return Err(format!("Non-image content type: {}", url));
        }

        // Extract the content length (size in bytes) from the response headers
        content_length = response
            .headers()
            .get(reqwest::header::CONTENT_LENGTH)
            .and_then(|value| value.to_str().ok())
            .and_then(|s| s.parse::<u64>().ok())
            .unwrap_or(0);
    }

    // Convert the size from bytes to kilobytes (KB)
    let size_kb = content_length / 1024;

    // Return the size in KB, content type, and status code as u16
    Ok((size_kb, content_type, status_code_int))
}

/// Extracts image URLs, alt tags, sizes, content types, and status codes from HTML.
///
/// # Arguments
/// * `html` - The HTML content as a string.
/// * `base_url` - The base URL used to resolve relative image URLs.
///
/// # Returns
/// A vector of tuples containing the image URL, alt text, size in KB, content type, and status code as u16.
pub async fn extract_images_with_sizes_and_alts(
    html: &str,
    base_url: &Url,
) -> Result<Vec<(String, String, u64, String, u16)>, String> {
    // Extract image URLs and alt tags from the HTML
    let image_urls_and_alts = extract_image_urls_and_alts(html, base_url);

    // Create a list of futures to fetch image sizes, content types, and status codes in parallel
    let fetch_futures = image_urls_and_alts
        .into_iter()
        .map(|(image_url, alt)| async move {
            // Always return image URL and alt text, even if fetch fails
            let url_string = image_url.to_string();

            match fetch_image_size(&image_url).await {
                Ok((size, content_type, status_code)) => {
                    // If successful, return a tuple with the image details
                    (url_string, alt, size, content_type, status_code)
                }
                Err(e) => {
                    // If there's an error, log it and return with default values and error code 0
                    eprintln!("{}", e);
                    (url_string, alt, 0, String::new(), 0)
                }
            }
        });

    // Execute all futures concurrently and wait for them to complete
    let results = join_all(fetch_futures).await;

    // Return the collected image details
    Ok(results)
}
