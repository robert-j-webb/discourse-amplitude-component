import { withPluginApi } from "discourse/lib/plugin-api";

export default {
  name: "init-amplitude",
  initialize() {
    withPluginApi("2.0.0", async (api) => {
      await waitUntil(() => window.disableAmplitude || window.amplitude);
      if (!window.amplitude) {
        return;
      }
      const ssoEnabled =
        api.container.lookup("site-settings:main").enable_discourse_connect;
      let currentUser = api.getCurrentUser();
      let referrer = document.referrer;
      let ua = navigator.userAgent;
      let platform = "Web";
      let userID;
      let currentUrl;
      let currentPage;

      // identify() will be called when a user logs in, or refreshes the page.
      if (settings.track_users && currentUser && !userID) {
        api.container
          .lookup("store:main")
          .find("user", currentUser.username)
          .then((user) => {
            userID =
              ssoEnabled && settings.track_by_external_id
                ? user.external_id
                : user.id;
            const identity = new window.amplitude.Identify();
            identity.set("id", user.id);
            if (settings.include_user_email) {
              identity.set("email", user.email);
            }
            if (settings.include_user_name) {
              identity.set("name", user.name);
            }

            window.amplitude.identify(identity);
          });
      }

      if (ua.match(/(iPhone|iPod|iPad)/)) {
        platform = "iOS";
      }

      if (ua.match(/(Android)/)) {
        platform = "Android";
      }

      function page(pageTitle) {
        window.amplitude.track("[Amplitude] Page Viewed", {
          "[Amplitude] Page Domain":
            (typeof location !== "undefined" && location.hostname) || "",
          "[Amplitude] Page Location":
            (typeof location !== "undefined" && location.href) || "",
          "[Amplitude] Page Path":
            (typeof location !== "undefined" && location.pathname) || "",
          "[Amplitude] Page Title": pageTitle,
          "[Amplitude] Page URL":
            (typeof location !== "undefined" && location.href.split("?")[0]) ||
            "",
        });
      }

      function track(title, opts) {
        opts = opts || {};
        opts.platform = platform;
        opts.location = currentPage;
        window.amplitude.track(title, opts);
      }

      function pageChanged(container, details) {
        let routeName = details.currentRouteName;
        let route = container.lookup(`route:${routeName}`);
        let model = route.currentModel;
        let pageTitle;

        currentUrl = window.location.href;

        switch (routeName) {
          case "discovery.latest":
            pageTitle = "Latest Topics";
            page(pageTitle);
            break;
          case "discovery.categories":
            pageTitle = "All Categories";
            page(pageTitle);
            break;
          case "discovery.parentCategory":
          case "discovery.category":
            if (model && model.category) {
              pageTitle = `Category: ${model.category.name}`;
              page(pageTitle);
            }
            break;
          case "tags.show":
            if (model && model.id) {
              pageTitle = `Tag: ${model.id}`;
              page(pageTitle);
            }
            break;
          case "tags.showCategory":
            if (model && model.id) {
              pageTitle = `Category Tag: ${model.id}`;
              page(pageTitle);
            }
            break;
          case "topic.fromParams":
          case "topic.fromParamsNear":
            if (details.title) {
              pageTitle = `Topic: ${details.title}`;
              page(pageTitle);
            }
        }

        referrer = currentUrl;
      }

      if (settings.track_page) {
        page(api.container.lookup("service:document-title").getTitle());
        api.onAppEvent("page:changed", (details) => {
          pageChanged(api.container, details);
        });
      }

      if (settings.track_topic_creation) {
        api.onAppEvent("topic:created", (post, composerModel) => {
          if (post) {
            track("TopicCreated", {
              topic_id: post.topic_id,
              topic_title: post.title,
              category_id: composerModel.get("category.id"),
              category_name: composerModel.get("category.name"),
            });
          }
        });
      }

      if (settings.track_post_creation) {
        api.onAppEvent("post:created", (post) => {
          if (post) {
            track("PostCreated", {
              post_id: post.id,
              topic_id: post.get("topic.id"),
              topic_title: post.get("topic.title"),
              category_id: post.get("topic.category.id"),
              category_name: post.get("topic.category.name"),
            });
          }
        });
      }

      if (settings.track_likes) {
        api.onAppEvent("page:like-toggled", (post, likeAction) => {
          let topic = post.topic;
          if (post && topic && likeAction && likeAction.acted) {
            track("Like", {
              topic_id: topic.id,
              topic_title: topic.title,
              category_id: topic.get("category.id"),
              category_name: topic.get("category.name"),
              post_id: post.id,
            });
          }
        });
      }

      if (settings.track_bookmarks) {
        api.onAppEvent("page:bookmark-post-toggled", (post) => {
          let topic = post.topic;
          if (post && post.bookmarked && topic) {
            track(
              post.post_number === 1 ? "TopicBookmarked" : "PostBookmarked",
              {
                topic_id: topic.id,
                topic_title: topic.title,
                category_id: topic.get("category.id"),
                category_name: topic.get("category.name"),
                post_id: post.post_number === 1 ? null : post.id,
              }
            );
          }
        });
      }

      if (settings.track_flags) {
        api.onAppEvent("post:flag-created", (post, postAction) => {
          if (post && postAction) {
            track("Flag", {
              post_id: post.id,
              topic_id: post.topic_id,
              topic_title: post.get("topic.title"),
              flag_option: postAction.get("actionType.name"),
            });
          }
        });
      }
    });
  },
};

async function wait(ms = 15) {
  await new Promise((resolve) =>
    setTimeout(
      () =>
        requestAnimationFrame(() => {
          resolve();
        }),
      ms
    )
  );
}

/**
 * Checks every 15ms for a condition, up to a default of 1000 times, or 15s.
 */
async function waitUntil(condition, maxChecks = 1000) {
  let timesChecked = 0;
  while (!condition() && timesChecked < maxChecks) {
    timesChecked++;
    await wait();
  }
}
